import { RuntimeMessageType } from "@immersionkit/shared";
import type {
  ActiveAssetContext,
  ContentAssetContext,
  GetAccountStateResponse,
  GetTabZoomResponse,
  GetContentAnalysisContextMessage,
  GetContentAnalysisContextResponse,
  GetAssetContextMessage,
  GetAssetContextResponse,
  GetLearningItemsResponse,
  GetLearningItemsMessage,
  GetUserDataMessage,
  GetUserDataResponse,
  GetSentenceAnalysisCacheResponse,
  RemoveUserDataMessage,
  SetUserDataMessage,
  GetUserVocabMessage,
  GetUserVocabResponse,
  LogoutAccountResponse,
  SetVocabStatusMessage,
  SetVocabStatusResponse,
  GraduateCheckpointResponse,
  PingResponse,
  QueueActivationEventMessage,
  QueueActivationEventResponse,
  QueueSentenceCandidatesMessage,
  QueueSentenceCandidatesResponse,
  RefreshActiveTabMessage,
  RefreshActiveTabResponse,
  RuntimeMessage,
  RuntimeErrorResponse,
  AssistEventMessage,
  QualifiedExposureEventMessage,
  LoadContentContextMessage,
  LoadContentContextResponse,
  MutateUserDataResponse,
  SentenceTranslationResultMessage,
  SpeakTextMessage,
  SpeakTextResponse,
  StartAccountLoginResponse,
  SubmitFeedbackMessage,
  SubmitFeedbackResponse
} from "@immersionkit/shared";

import { getBackgroundAssetPackService } from "./asset-packs";
import { BackgroundLearningItemService } from "./learning-items";
import { CurriculumProgressionService } from "./curriculum-progression";
import { IndexedDbSentenceAnalysisCacheRepository } from "./sentence-analysis-cache";
import {
  SentenceQueueOrchestrator,
  type SentenceTranslationDelivery
} from "./sentence-queue";
import { loadBackgroundRuntimeConfig } from "./settings";
import { ContentContextService } from "./content-context";
import { isRecord } from "../storage/serialization";
import { diagnosticInfo } from "../shared/logger";
import {
  POPUP_OVERLAY_TOGGLE_MESSAGE_TYPE,
  type PopupOverlayToggleResponse
} from "../shared/popup-overlay";
import {
  IndexedDbUserDataRepository,
  IndexedDbUserVocabRepository,
  loadUserDataValues,
  removeUserDataValues,
  setUserDataValues,
  USER_DATA_KEYS
} from "../storage/user-data-repository";
import { BackgroundTextToSpeechService } from "./tts";
import { ImmersionKitApiClient } from "./api-client";
import { BackgroundAccountService } from "./account-service";
import { BackgroundActivationEventQueue } from "./event-queue";
import {
  canUseActionOverlayForTab,
  resolveActionPopupPathForTab
} from "./action-popup";

type BackgroundHandledRuntimeMessage = Exclude<
  RuntimeMessage,
  SentenceTranslationResultMessage
>;

type RuntimeResponseSender = (response: unknown) => void;

type RuntimeMessageHandler<TMessage extends BackgroundHandledRuntimeMessage> = (
  message: TMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: RuntimeResponseSender
) => boolean;

type RuntimeMessageHandlerMap = {
  [Type in BackgroundHandledRuntimeMessage["type"]]: RuntimeMessageHandler<
    Extract<BackgroundHandledRuntimeMessage, { type: Type }>
  >;
};

const RUNTIME_MESSAGE_TYPES = new Set<string>(Object.values(RuntimeMessageType));
export class BackgroundRuntimeCoordinator {
  private readonly sentenceQueue: SentenceQueueOrchestrator;
  private readonly learningItems: BackgroundLearningItemService;
  private readonly curriculumProgression: CurriculumProgressionService;
  private readonly sentenceAnalysisCache: IndexedDbSentenceAnalysisCacheRepository;
  private readonly userVocab: IndexedDbUserVocabRepository;
  private readonly contentContext: ContentContextService;
  private readonly assetPacks = getBackgroundAssetPackService();
  private readonly tts = new BackgroundTextToSpeechService();
  private readonly apiClient = new ImmersionKitApiClient();
  private readonly accountService = new BackgroundAccountService({
    apiClient: this.apiClient
  });
  private readonly eventQueue = new BackgroundActivationEventQueue({
    accountService: this.accountService,
    apiClient: this.apiClient
  });
  private readonly runtimeMessageHandlers: RuntimeMessageHandlerMap = {
    [RuntimeMessageType.Ping]: (_message, _sender, sendResponse) => {
      sendResponse({
        ok: true,
        source: "background",
        timestamp: new Date().toISOString()
      } satisfies PingResponse);
      return false;
    },
    [RuntimeMessageType.RefreshActiveTab]: (_message, _sender, sendResponse) => {
      void this.handleRefreshActiveTab(sendResponse);
      return true;
    },
    [RuntimeMessageType.GetTabZoom]: (_message, sender, sendResponse) => {
      void this.handleGetTabZoom(sender, sendResponse);
      return true;
    },
    [RuntimeMessageType.GetAccountState]: (_message, _sender, sendResponse) => {
      void this.handleGetAccountState(sendResponse);
      return true;
    },
    [RuntimeMessageType.StartAccountLogin]: (_message, sender, sendResponse) => {
      void this.handleStartAccountLogin(sender, sendResponse);
      return true;
    },
    [RuntimeMessageType.LogoutAccount]: (_message, sender, sendResponse) => {
      void this.handleLogoutAccount(sender, sendResponse);
      return true;
    },
    [RuntimeMessageType.QueueActivationEvent]: (message, _sender, sendResponse) => {
      void this.handleQueueActivationEvent(message, sendResponse);
      return true;
    },
    [RuntimeMessageType.SubmitFeedback]: (message, sender, sendResponse) => {
      void this.handleSubmitFeedback(message, sender, sendResponse);
      return true;
    },
    [RuntimeMessageType.GetLearningItems]: (message, _sender, sendResponse) => {
      void this.handleGetLearningItems(message, sendResponse);
      return true;
    },
    [RuntimeMessageType.GetUserData]: (message, sender, sendResponse) => {
      void this.handleGetUserData(message, sender, sendResponse);
      return true;
    },
    [RuntimeMessageType.SetUserData]: (message, sender, sendResponse) => {
      void this.handleSetUserData(message, sender, sendResponse);
      return true;
    },
    [RuntimeMessageType.RemoveUserData]: (message, sender, sendResponse) => {
      void this.handleRemoveUserData(message, sender, sendResponse);
      return true;
    },
    [RuntimeMessageType.GetUserVocab]: (message, _sender, sendResponse) => {
      void this.handleGetUserVocab(message, sendResponse);
      return true;
    },
    [RuntimeMessageType.SetVocabStatus]: (message, _sender, sendResponse) => {
      void this.handleSetVocabStatus(message, sendResponse);
      return true;
    },
    [RuntimeMessageType.GetAssetContext]: (message, _sender, sendResponse) => {
      void this.handleGetAssetContext(message, sendResponse);
      return true;
    },
    [RuntimeMessageType.GetSentenceAnalysisCache]: (
      message,
      _sender,
      sendResponse
    ) => {
      void this.handleGetSentenceAnalysisCache(message.sentenceHashes, sendResponse);
      return true;
    },
    [RuntimeMessageType.LoadContentContext]: (message, _sender, sendResponse) => {
      void this.handleLoadContentContext(message, sendResponse);
      return true;
    },
    [RuntimeMessageType.GetContentAnalysisContext]: (
      message,
      _sender,
      sendResponse
    ) => {
      void this.handleGetContentAnalysisContext(message, sendResponse);
      return true;
    },
    [RuntimeMessageType.GraduateCheckpoint]: (_message, _sender, sendResponse) => {
      void this.handleGraduateCheckpoint(sendResponse);
      return true;
    },
    [RuntimeMessageType.QueueSentenceCandidates]: (
      message,
      sender,
      sendResponse
    ) => {
      void this.handleQueueSentenceCandidates(message, sender, sendResponse);
      return true;
    },
    [RuntimeMessageType.SpeakText]: (message, _sender, sendResponse) => {
      void this.handleSpeakText(message, sendResponse);
      return true;
    },
    [RuntimeMessageType.AssistEvent]: (message, _sender, sendResponse) => {
      void this.handleAssistEvent(message, sendResponse);
      return true;
    },
    [RuntimeMessageType.QualifiedExposureEvent]: (
      message,
      sender,
      sendResponse
    ) => {
      void this.handleQualifiedExposureEvent(message, sender, sendResponse);
      return true;
    }
  };
  private isBooted = false;

  constructor() {
    this.sentenceQueue = new SentenceQueueOrchestrator({
      notifyFreshTranslations: (deliveries) =>
        this.deliverFreshSentenceTranslations(deliveries)
    });
    this.learningItems = new BackgroundLearningItemService();
    this.curriculumProgression = new CurriculumProgressionService();
    this.sentenceAnalysisCache = new IndexedDbSentenceAnalysisCacheRepository();
    this.userVocab = new IndexedDbUserVocabRepository();
    this.contentContext = new ContentContextService();
  }

  boot() {
    if (this.isBooted) {
      return;
    }

    this.isBooted = true;
    void this.prepareAssetPacks();
    void this.backfillLearningItemBands();
    void this.accountService.ensureInstallIdentity();
    void this.eventQueue.queueEvent({
      eventName: "active_day",
      properties: { surface: "background", dayIndex: 0 }
    });

    chrome.runtime.onInstalled.addListener((details) => {
      diagnosticInfo("ImmersionKit background service worker installed.");
      if (details.reason === "install") {
        void showFirstRunGuidance();
        void this.eventQueue.queueEvent({
          eventName: "install_registered",
          properties: { surface: "background" }
        });
      }
      void this.prepareAssetPacks();
      void this.backfillLearningItemBands();
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) =>
      this.dispatchRuntimeMessage(message, sender, sendResponse)
    );

    this.installActionPopupRouting();

    chrome.action?.onClicked.addListener((tab) => {
      void this.handleActionClick(tab);
    });
  }

  private dispatchRuntimeMessage(
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: RuntimeResponseSender
  ): boolean {
    if (!isRuntimeMessage(message)) {
      return false;
    }

    const handler = this.runtimeMessageHandlers[
      message.type as BackgroundHandledRuntimeMessage["type"]
    ] as RuntimeMessageHandler<BackgroundHandledRuntimeMessage> | undefined;

    if (!handler) {
      return false;
    }

    return handler(
      message as BackgroundHandledRuntimeMessage,
      sender,
      sendResponse
    );
  }

  private async handleRefreshActiveTab(
    sendResponse: (response: RefreshActiveTabResponse | RuntimeErrorResponse) => void
  ) {
    try {
      const activeTabId = await getActiveTabId();
      if (activeTabId === null) {
        sendResponse({
          ok: false,
          refreshed: false,
          tabId: null,
          reason: "no-active-tab"
        });
        return;
      }

      const sent = await sendRefreshMessageToTab(activeTabId, {
        type: RuntimeMessageType.RefreshActiveTab
      });
      if (!sent) {
        sendResponse({
          ok: false,
          refreshed: false,
          tabId: activeTabId,
          reason: "refresh-delivery-failed"
        });
        return;
      }

      sendResponse({
        ok: true,
        refreshed: true,
        tabId: activeTabId
      });
    } catch (error) {
      console.warn("ImmersionKit active-tab refresh failed.", error);
      sendResponse({
        ok: false,
        error: "refresh-active-tab-failed"
      });
    }
  }

  private async handleActionClick(tab: chrome.tabs.Tab): Promise<void> {
    if (!canUseActionOverlayForTab(tab) || typeof tab.id !== "number") {
      diagnosticInfo("ImmersionKit popup overlay skipped.", {
        reason: "unsupported-tab",
        url: tab.url ?? null
      });
      return;
    }

    const zoomFactor = await getTabZoomFactor(tab.id);
    let sent = await sendPopupOverlayToggleMessageToTab(tab.id, zoomFactor);
    if (!sent && (await injectContentScriptsIntoTab(tab.id))) {
      sent = await sendPopupOverlayToggleMessageToTab(tab.id, zoomFactor);
    }

    if (!sent) {
      diagnosticInfo("ImmersionKit popup overlay skipped.", {
        reason: "toggle-delivery-failed",
        tabId: tab.id
      });
    }
  }

  private installActionPopupRouting(): void {
    if (!chrome.action?.setPopup || !chrome.tabs) {
      return;
    }

    chrome.tabs.onActivated?.addListener((activeInfo) => {
      void this.updateActionPopupForTabId(activeInfo.tabId);
    });

    chrome.tabs.onUpdated?.addListener((tabId, changeInfo, tab) => {
      if (!changeInfo.url && changeInfo.status !== "loading") {
        return;
      }

      void this.updateActionPopupForTab({
        ...tab,
        id: typeof tab.id === "number" ? tab.id : tabId,
        url: changeInfo.url ?? tab.url
      });
    });

    chrome.windows?.onFocusChanged?.addListener((windowId) => {
      if (windowId === chrome.windows.WINDOW_ID_NONE) {
        return;
      }

      void this.refreshActiveTabActionPopup(windowId);
    });

    chrome.runtime.onStartup?.addListener(() => {
      void this.refreshActiveTabActionPopup();
    });

    void this.refreshActiveTabActionPopup();
  }

  private async refreshActiveTabActionPopup(windowId?: number): Promise<void> {
    const tab = await getActiveTab(windowId);
    if (tab) {
      await this.updateActionPopupForTab(tab);
    }
  }

  private async updateActionPopupForTabId(tabId: number): Promise<void> {
    const tab = await getTabById(tabId);
    await this.updateActionPopupForTab(tab ?? ({ id: tabId } as chrome.tabs.Tab));
  }

  private async updateActionPopupForTab(tab: chrome.tabs.Tab): Promise<void> {
    if (typeof tab.id !== "number") {
      return;
    }

    await setActionPopupForTab(tab.id, resolveActionPopupPathForTab(tab));
  }

  private async handleQueueSentenceCandidates(
    message: QueueSentenceCandidatesMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: QueueSentenceCandidatesResponse) => void
  ) {
    try {
      const response = await this.sentenceQueue.queueMessage(message, sender.tab?.id);
      sendResponse(response);
    } catch (error) {
      console.warn("ImmersionKit sentence queue handling failed.", error);
      sendResponse({
        ok: false,
        error: "sentence-queue-failed"
      });
    }
  }

  private async handleGetTabZoom(
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: GetTabZoomResponse) => void
  ) {
    try {
      sendResponse({
        ok: true,
        zoomFactor: await getTabZoomFactor(sender.tab?.id ?? null)
      });
    } catch (error) {
      console.warn("ImmersionKit tab zoom read failed.", error);
      sendResponse({
        ok: false,
        error: "tab-zoom-read-failed"
      });
    }
  }

  private async handleSpeakText(
    message: SpeakTextMessage,
    sendResponse: (response: SpeakTextResponse) => void
  ) {
    try {
      sendResponse(await this.tts.speak(message));
    } catch (error) {
      console.warn("ImmersionKit TTS handling failed.", error);
      sendResponse({
        ok: false,
        error: "tts-failed"
      });
    }
  }

  private async handleGetLearningItems(
    message: GetLearningItemsMessage,
    sendResponse: (response: GetLearningItemsResponse) => void
  ) {
    try {
      sendResponse({
        ok: true,
        items: Array.isArray(message.unitRefIds)
          ? await this.learningItems.listItemsByUnitRefIds(message.unitRefIds.slice(0, 100))
          : await this.learningItems.listItems()
      });
    } catch (error) {
      console.warn("ImmersionKit learning item read failed.", error);
      sendResponse({
        ok: false,
        error: "learning-items-read-failed"
      });
    }
  }

  private async handleGetAccountState(
    sendResponse: (response: GetAccountStateResponse) => void
  ) {
    try {
      sendResponse({
        ok: true,
        state: await this.accountService.getState()
      });
    } catch (error) {
      console.warn("ImmersionKit account state read failed.", error);
      sendResponse({
        ok: false,
        error: "account-state-read-failed"
      });
    }
  }

  private async handleStartAccountLogin(
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: StartAccountLoginResponse) => void
  ) {
    if (!isExtensionPageSender(sender)) {
      sendResponse({
        ok: false,
        error: "account-login-forbidden"
      });
      return;
    }

    try {
      const state = await this.accountService.startGoogleLogin();
      void this.eventQueue.queueEvent({
        eventName: "signup_completed",
        properties: { surface: "options" }
      });
      void refreshTabsAfterCurriculumProgression(undefined);
      sendResponse({ ok: true, state });
    } catch (error) {
      console.warn("ImmersionKit account login failed.", error);
      sendResponse({
        ok: false,
        error: "account-login-failed"
      });
    }
  }

  private async handleLogoutAccount(
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: LogoutAccountResponse) => void
  ) {
    if (!isExtensionPageSender(sender)) {
      sendResponse({
        ok: false,
        error: "account-logout-forbidden"
      });
      return;
    }

    try {
      const state = await this.accountService.logout();
      void refreshTabsAfterCurriculumProgression(undefined);
      sendResponse({ ok: true, state });
    } catch (error) {
      console.warn("ImmersionKit account logout failed.", error);
      sendResponse({
        ok: false,
        error: "account-logout-failed"
      });
    }
  }

  private async handleQueueActivationEvent(
    message: QueueActivationEventMessage,
    sendResponse: (response: QueueActivationEventResponse) => void
  ) {
    try {
      sendResponse({
        ok: true,
        queued: await this.eventQueue.queueEvent({
          eventName: message.eventName,
          properties: message.properties
        })
      });
    } catch (error) {
      console.warn("ImmersionKit activation event rejected.", error);
      sendResponse({
        ok: false,
        error: "activation-event-rejected"
      });
    }
  }

  private async handleSubmitFeedback(
    message: SubmitFeedbackMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: SubmitFeedbackResponse) => void
  ) {
    if (!isExtensionPageSender(sender)) {
      sendResponse({
        ok: false,
        error: "feedback-submit-forbidden"
      });
      return;
    }

    try {
      const install = await this.accountService.ensureInstallIdentity();
      const session = await this.accountService.loadSessionForApi();
      let submitted = false;
      if (this.apiClient.isConfigured()) {
        await this.apiClient.submitFeedback(
          {
            category: message.category,
            description: message.description,
            diagnostics: createBackendFeedbackDiagnostics(message.diagnostics),
            installId: install.installId
          },
          { accessToken: session?.accessToken ?? null }
        );
        submitted = true;
      }
      const queuedTelemetry = await this.eventQueue.queueEvent({
        eventName: "feedback_submitted",
        properties: { surface: "options", action: "submit" }
      });
      sendResponse({ ok: true, submitted, queuedTelemetry });
    } catch (error) {
      console.warn("ImmersionKit feedback submit failed.", error);
      sendResponse({
        ok: false,
        error: "feedback-submit-failed"
      });
    }
  }

  private async handleGetAssetContext(
    message: GetAssetContextMessage,
    sendResponse: (response: GetAssetContextResponse) => void
  ) {
    try {
      const context = await this.assetPacks.loadActiveContext();
      sendResponse({
        ok: true,
        context: message.includeRenderUnits
          ? context
          : createContentAssetContext(context)
      });
    } catch (error) {
      console.warn("ImmersionKit asset context read failed.", error);
      sendResponse({
        ok: false,
        error: "asset-context-read-failed"
      });
    }
  }

  private async handleGetUserData(
    message: GetUserDataMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: GetUserDataResponse) => void
  ) {
    if (!isExtensionPageSender(sender)) {
      sendResponse({
        ok: false,
        error: "user-data-read-forbidden"
      });
      return;
    }

    try {
      sendResponse({
        ok: true,
        values: await loadUserDataValues(
          Array.isArray(message.keys) ? message.keys.slice(0, 100) : []
        )
      });
    } catch (error) {
      console.warn("ImmersionKit user data read failed.", error);
      sendResponse({
        ok: false,
        error: "user-data-read-failed"
      });
    }
  }

  private async handleSetUserData(
    message: SetUserDataMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MutateUserDataResponse) => void
  ) {
    if (!isExtensionPageSender(sender)) {
      sendResponse({
        ok: false,
        error: "user-data-write-forbidden"
      });
      return;
    }

    try {
      await setUserDataValues(isRecord(message.values) ? message.values : {});
      sendResponse({ ok: true });
    } catch (error) {
      console.warn("ImmersionKit user data write failed.", error);
      sendResponse({
        ok: false,
        error: "user-data-write-failed"
      });
    }
  }

  private async handleRemoveUserData(
    message: RemoveUserDataMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MutateUserDataResponse) => void
  ) {
    if (!isExtensionPageSender(sender)) {
      sendResponse({
        ok: false,
        error: "user-data-remove-forbidden"
      });
      return;
    }

    try {
      await removeUserDataValues(
        Array.isArray(message.keys) ? message.keys.slice(0, 100) : []
      );
      sendResponse({ ok: true });
    } catch (error) {
      console.warn("ImmersionKit user data remove failed.", error);
      sendResponse({
        ok: false,
        error: "user-data-remove-failed"
      });
    }
  }

  private async handleGetUserVocab(
    message: GetUserVocabMessage,
    sendResponse: (response: GetUserVocabResponse) => void
  ) {
    try {
      const entries = [...(await this.userVocab.loadAll()).values()];
      const requestedLexemeIds = new Set(
        (Array.isArray(message.lexemeIds) ? message.lexemeIds : [])
          .map((lexemeId) => lexemeId.trim())
          .filter(Boolean)
      );
      sendResponse({
        ok: true,
        entries:
          requestedLexemeIds.size > 0
            ? entries.filter((entry) => requestedLexemeIds.has(entry.lexemeId))
            : entries
      });
    } catch (error) {
      console.warn("ImmersionKit vocab read failed.", error);
      sendResponse({
        ok: false,
        error: "vocab-read-failed"
      });
    }
  }

  private async handleSetVocabStatus(
    message: SetVocabStatusMessage,
    sendResponse: (response: SetVocabStatusResponse) => void
  ) {
    try {
      sendResponse({
        ok: true,
        entry: await this.userVocab.setStatus({
          lexemeId: message.lexemeId,
          status: message.status,
          lastSeenAt: message.lastSeenAt,
          updatedAt: message.updatedAt,
          incrementExposure: message.incrementExposure
        })
      });
    } catch (error) {
      console.warn("ImmersionKit vocab status write failed.", error);
      sendResponse({
        ok: false,
        error: "vocab-status-write-failed"
      });
    }
  }

  private async handleGetSentenceAnalysisCache(
    sentenceHashes: readonly string[] | undefined,
    sendResponse: (response: GetSentenceAnalysisCacheResponse) => void
  ) {
    try {
      sendResponse({
        ok: true,
        entries: Array.isArray(sentenceHashes)
          ? await this.sentenceAnalysisCache.listBySentenceHashes(sentenceHashes)
          : await this.sentenceAnalysisCache.listAll()
      });
    } catch (error) {
      console.warn("ImmersionKit sentence analysis cache read failed.", error);
      sendResponse({
        ok: false,
        error: "sentence-analysis-cache-read-failed"
      });
    }
  }

  private async handleLoadContentContext(
    message: LoadContentContextMessage,
    sendResponse: (response: LoadContentContextResponse) => void
  ) {
    try {
      sendResponse({
        ok: true,
        context: await this.contentContext.loadContext({
          hostname: message.hostname,
          sentenceHashes: message.sentenceHashes
        })
      });
    } catch (error) {
      console.warn("ImmersionKit content context load failed.", error);
      sendResponse({
        ok: false,
        error: "content-context-load-failed"
      });
    }
  }

  private async handleGetContentAnalysisContext(
    message: GetContentAnalysisContextMessage,
    sendResponse: (response: GetContentAnalysisContextResponse) => void
  ) {
    try {
      sendResponse({
        ok: true,
        context: await this.contentContext.loadAnalysisContext(message.sentenceHashes)
      });
    } catch (error) {
      console.warn("ImmersionKit content analysis context load failed.", error);
      sendResponse({
        ok: false,
        error: "content-analysis-context-load-failed"
      });
    }
  }

  private async handleGraduateCheckpoint(
    sendResponse: (response: GraduateCheckpointResponse) => void
  ) {
    try {
      const runtimeConfig = await loadBackgroundRuntimeConfig();
      const result = await this.curriculumProgression.advanceAfterExplicitCheckpoint({
        config: runtimeConfig.curriculum.config,
        profile: runtimeConfig.curriculum.profile,
        items: await this.learningItems.listItems()
      });
      if (result.profile) {
        void refreshTabsAfterCurriculumProgression(undefined);
      }
      sendResponse({
        ok: true,
        advanced: Boolean(result.profile),
        previousBandId: result.diagnostics.previousBandId,
        nextBandId: result.diagnostics.nextBandId,
        reason: result.diagnostics.reason,
        unmetRequirements: result.diagnostics.unmetRequirements
      });
    } catch (error) {
      console.warn("ImmersionKit checkpoint graduation failed.", error);
      sendResponse({
        ok: false,
        error: "checkpoint-graduation-failed"
      });
    }
  }

  private async handleAssistEvent(
    message: AssistEventMessage,
    sendResponse: (
      response: { ok: true; stored: boolean } | RuntimeErrorResponse
    ) => void
  ) {
    try {
      const item = await this.learningItems.recordAssist(message);
      sendResponse({
        ok: true,
        stored: Boolean(item)
      });
    } catch (error) {
      console.warn("ImmersionKit assist evidence handling failed.", error);
      sendResponse({
        ok: false,
        error: "assist-evidence-failed"
      });
    }
  }

  private async handleQualifiedExposureEvent(
    message: QualifiedExposureEventMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (
      response: { ok: true; stored: boolean } | RuntimeErrorResponse
    ) => void
  ) {
    try {
      const item = await this.learningItems.recordQualifiedExposure(message);
      if (item) {
        await this.advanceCurriculumAfterExposure(sender.tab?.id);
      }
      sendResponse({
        ok: true,
        stored: Boolean(item)
      });
    } catch (error) {
      console.warn("ImmersionKit exposure evidence handling failed.", error);
      sendResponse({
        ok: false,
        error: "exposure-evidence-failed"
      });
    }
  }

  private async advanceCurriculumAfterExposure(sourceTabId: number | undefined): Promise<void> {
    try {
      const runtimeConfig = await loadBackgroundRuntimeConfig();
      const result = await this.curriculumProgression.advanceAfterImplicitEvidence({
        config: runtimeConfig.curriculum.config,
        profile: runtimeConfig.curriculum.profile,
        items: await this.learningItems.listItems()
      });
      if (result.profile) {
        void refreshTabsAfterCurriculumProgression(sourceTabId);
      }
    } catch (error) {
      console.warn("ImmersionKit curriculum progression failed.", error);
    }
  }

  private async deliverFreshSentenceTranslations(
    deliveries: SentenceTranslationDelivery[]
  ) {
    await Promise.all(
      deliveries.map(async (delivery) => {
        const sent = await sendSentenceTranslationMessageToTab(delivery.tabId, {
          type: RuntimeMessageType.SentenceTranslationResult,
          results: delivery.results
        });

        if (!sent) {
          diagnosticInfo("ImmersionKit sentence translation delivery skipped.", {
            tabId: delivery.tabId
          });
        }
      })
    );
  }

  private async prepareAssetPacks() {
    try {
      const context = await this.assetPacks.loadActiveContext();
      diagnosticInfo("ImmersionKit asset packs ready.", {
        source: context.source,
        renderUnitCount: context.renderUnits.length,
        assetVersion: context.assetVersion,
        bandIds: context.bandIds,
        missingBandIds: context.missingBandIds
      });
      void this.eventQueue.queueEvent({
        eventName: context.source === "empty" ? "asset_fallback" : "asset_load",
        properties: {
          surface: "background",
          assetSource: context.source,
          assetVersion: context.assetVersion ?? undefined,
          count: context.renderUnits.length
        }
      });
    } catch (error) {
      console.warn("ImmersionKit failed to prepare asset packs.", error);
    }
  }

  private async backfillLearningItemBands() {
    try {
      const result = await this.learningItems.backfillMissingBands();
      if (result.updated > 0 || result.remaining > 0) {
        diagnosticInfo("ImmersionKit learning item band backfill checked.", result);
      }
    } catch (error) {
      console.warn("ImmersionKit learning item band backfill failed.", error);
    }
  }
}

function createContentAssetContext(context: ActiveAssetContext): ContentAssetContext {
  return {
    languagePair: context.languagePair,
    renderUnits: context.renderUnits,
    sentenceHintPhrases: context.sentenceHintPhrases,
    source: context.source,
    assetVersion: context.assetVersion,
    bandIds: context.bandIds,
    missingBandIds: context.missingBandIds
  };
}

function createBackendFeedbackDiagnostics(input: unknown): Record<string, string | number> {
  const diagnostics: Record<string, string | number> = {
    timezoneOffsetMinutes: new Date().getTimezoneOffset()
  };
  const bundle = isPlainRecord(input) ? input : {};
  const extension = isPlainRecord(bundle.extension) ? bundle.extension : {};
  const browser = isPlainRecord(bundle.browser) ? bundle.browser : {};

  const extensionVersion = readNonEmptyString(extension.version);
  if (extensionVersion) {
    diagnostics.extensionVersion = extensionVersion;
  }

  const buildProfile = readNonEmptyString(extension.buildProfile);
  if (
    buildProfile === "development" ||
    buildProfile === "preview" ||
    buildProfile === "production"
  ) {
    diagnostics.buildProfile = buildProfile;
  }

  const locale = readNonEmptyString(browser.language);
  if (locale) {
    diagnostics.locale = locale;
  }

  return diagnostics;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function showFirstRunGuidance(): Promise<void> {
  await new IndexedDbUserDataRepository().setValue(
    USER_DATA_KEYS.firstRunIntro,
    true
  );

  chrome.runtime.openOptionsPage?.();
}

function isRuntimeMessage(message: unknown): message is RuntimeMessage {
  if (!message || typeof message !== "object" || !("type" in message)) {
    return false;
  }

  return (
    typeof message.type === "string" && RUNTIME_MESSAGE_TYPES.has(message.type)
  );
}

function isExtensionPageSender(sender: chrome.runtime.MessageSender): boolean {
  if (typeof chrome === "undefined" || !chrome.runtime?.getURL) {
    return false;
  }

  return (
    typeof sender.url === "string" &&
    sender.url.startsWith(chrome.runtime.getURL(""))
  );
}

async function getActiveTabId(): Promise<number | null> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }

      const activeTabId = tabs[0]?.id;
      resolve(typeof activeTabId === "number" ? activeTabId : null);
    });
  });
}

async function getActiveTab(windowId?: number): Promise<chrome.tabs.Tab | null> {
  return new Promise((resolve) => {
    const queryInfo: chrome.tabs.QueryInfo =
      typeof windowId === "number"
        ? { active: true, windowId }
        : { active: true, currentWindow: true };

    chrome.tabs.query(queryInfo, (tabs) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }

      resolve(tabs[0] ?? null);
    });
  });
}

async function getTabById(tabId: number): Promise<chrome.tabs.Tab | null> {
  if (!chrome.tabs?.get) {
    return null;
  }

  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }

      resolve(tab ?? null);
    });
  });
}

async function setActionPopupForTab(tabId: number, popup: string): Promise<void> {
  if (!chrome.action?.setPopup) {
    return;
  }

  await new Promise<void>((resolve) => {
    chrome.action.setPopup({ tabId, popup }, () => {
      if (chrome.runtime.lastError) {
        diagnosticInfo("ImmersionKit action popup routing skipped.", {
          reason: "set-popup-failed",
          tabId,
          message: chrome.runtime.lastError.message
        });
      }

      resolve();
    });
  });
}

async function sendPopupOverlayToggleMessageToTab(
  tabId: number,
  zoomFactor: number
): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tabId,
      { type: POPUP_OVERLAY_TOGGLE_MESSAGE_TYPE, zoomFactor },
      (response?: PopupOverlayToggleResponse) => {
        resolve(!chrome.runtime.lastError && Boolean(response?.ok));
      }
    );
  });
}

async function getTabZoomFactor(tabId: number | null): Promise<number> {
  if (typeof tabId !== "number" || !chrome.tabs?.getZoom) {
    return 1;
  }

  return new Promise((resolve) => {
    chrome.tabs.getZoom(tabId, (zoomFactor) => {
      if (chrome.runtime.lastError) {
        resolve(1);
        return;
      }

      resolve(normalizeZoomFactor(zoomFactor));
    });
  });
}

function normalizeZoomFactor(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(5, Math.max(0.25, value))
    : 1;
}

async function injectContentScriptsIntoTab(tabId: number): Promise<boolean> {
  const files = (chrome.runtime.getManifest().content_scripts ?? [])
    .flatMap((script) => script.js ?? [])
    .filter((file): file is string => typeof file === "string" && file.length > 0);

  if (!chrome.scripting?.executeScript || !files || files.length === 0) {
    return false;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files
    });
    return true;
  } catch (error) {
    diagnosticInfo("ImmersionKit popup overlay injection failed.", {
      tabId,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

async function sendRefreshMessageToTab(
  tabId: number,
  message: RefreshActiveTabMessage
): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, () => {
      resolve(!chrome.runtime.lastError);
    });
  });
}

export async function refreshTabsAfterCurriculumProgression(
  sourceTabId: number | undefined
): Promise<number[]> {
  const tabIds = new Set<number>();
  if (typeof sourceTabId === "number") {
    tabIds.add(sourceTabId);
  }

  for (const tabId of await getActiveHttpTabIds()) {
    tabIds.add(tabId);
  }

  const refreshed: number[] = [];
  await Promise.all(
    [...tabIds].map(async (tabId) => {
      const sent = await sendRefreshMessageToTab(tabId, {
        type: RuntimeMessageType.RefreshActiveTab
      });
      if (sent) {
        refreshed.push(tabId);
      }
    })
  );
  return refreshed.sort((left, right) => left - right);
}

async function getActiveHttpTabIds(): Promise<number[]> {
  return new Promise((resolve) => {
    chrome.tabs.query(
      {
        active: true,
        url: ["http://*/*", "https://*/*"]
      },
      (tabs) => {
        if (chrome.runtime.lastError) {
          resolve([]);
          return;
        }

        resolve(
          (tabs ?? []).flatMap((tab) =>
            typeof tab.id === "number" ? [tab.id] : []
          )
        );
      }
    );
  });
}

async function sendSentenceTranslationMessageToTab(
  tabId: number,
  message: SentenceTranslationResultMessage
): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, () => {
      resolve(!chrome.runtime.lastError);
    });
  });
}
