import { RuntimeMessageType } from "@immersionkit/shared";
import type {
  ActiveAssetContext,
  ContentAssetContext,
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
  SetVocabStatusMessage,
  SetVocabStatusResponse,
  GraduateCheckpointResponse,
  PingResponse,
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
  SentenceTranslationResultMessage
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
  IndexedDbUserDataRepository,
  IndexedDbUserVocabRepository,
  loadUserDataValues,
  removeUserDataValues,
  setUserDataValues,
  USER_DATA_KEYS
} from "../storage/user-data-repository";

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
    [RuntimeMessageType.GetLearningItems]: (message, _sender, sendResponse) => {
      void this.handleGetLearningItems(message, sendResponse);
      return true;
    },
    [RuntimeMessageType.GetUserData]: (message, _sender, sendResponse) => {
      void this.handleGetUserData(message, sendResponse);
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

    chrome.runtime.onInstalled.addListener((details) => {
      diagnosticInfo("ImmersionKit background service worker installed.");
      if (details.reason === "install") {
        void showFirstRunGuidance();
      }
      void this.prepareAssetPacks();
      void this.backfillLearningItemBands();
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) =>
      this.dispatchRuntimeMessage(message, sender, sendResponse)
    );
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
    sendResponse: (response: GetUserDataResponse) => void
  ) {
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
