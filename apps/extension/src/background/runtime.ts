import { RuntimeMessageType } from "@immersionkit/shared";
import type {
  ActiveAssetContext,
  LearningItem,
  GetLearningItemsMessage,
  QueueSentenceCandidatesMessage,
  RefreshActiveTabMessage,
  RuntimeMessage,
  AssistEventMessage,
  QualifiedExposureEventMessage,
  SentenceAnalysisEntry,
  SentenceTranslationResultMessage
} from "@immersionkit/shared";

import { getBackgroundAssetPackService } from "./asset-packs";
import { BackgroundLearningItemService } from "./learning-items";
import { CurriculumProgressionService } from "./curriculum-progression";
import { IndexedDbPhraseRegistryRepository } from "./phrase-registry";
import { IndexedDbSentenceAnalysisCacheRepository } from "./sentence-analysis-cache";
import {
  SentenceQueueOrchestrator,
  type QueueSentenceCandidatesResponse,
  type SentenceTranslationDelivery
} from "./sentence-queue";
import { loadBackgroundRuntimeConfig } from "./settings";

type RefreshActiveTabResponse =
  | {
      ok: true;
      refreshed: true;
      tabId: number;
    }
  | {
      ok: false;
      refreshed: false;
      reason: string;
      tabId: number | null;
    };

type PingResponse = {
  ok: true;
  source: "background";
  timestamp: string;
};

type ErrorResponse = {
  ok: false;
  error: string;
};

export type GetLearningItemsResponse =
  | {
      ok: true;
      items: LearningItem[];
    }
  | ErrorResponse;

export type GetAssetContextResponse =
  | {
      ok: true;
      context: ActiveAssetContext;
    }
  | ErrorResponse;

export type GetSentenceAnalysisCacheResponse =
  | {
      ok: true;
      entries: SentenceAnalysisEntry[];
    }
  | ErrorResponse;

export type GraduateCheckpointResponse =
  | {
      ok: true;
      advanced: boolean;
      previousBandId: string | null;
      nextBandId: string | null;
      reason: string;
      unmetRequirements: string[];
    }
  | ErrorResponse;

const RUNTIME_MESSAGE_TYPES = new Set<string>(Object.values(RuntimeMessageType));
const FIRST_RUN_INTRO_STORAGE_KEY = "immersionkit.firstRun.showIntro";

export class BackgroundRuntimeCoordinator {
  private readonly sentenceQueue: SentenceQueueOrchestrator;
  private readonly learningItems: BackgroundLearningItemService;
  private readonly curriculumProgression: CurriculumProgressionService;
  private readonly phraseRegistry: IndexedDbPhraseRegistryRepository;
  private readonly sentenceAnalysisCache: IndexedDbSentenceAnalysisCacheRepository;
  private readonly assetPacks = getBackgroundAssetPackService();
  private isBooted = false;

  constructor() {
    this.sentenceQueue = new SentenceQueueOrchestrator({
      notifyFreshTranslations: (deliveries) =>
        this.deliverFreshSentenceTranslations(deliveries)
    });
    this.learningItems = new BackgroundLearningItemService();
    this.curriculumProgression = new CurriculumProgressionService();
    this.phraseRegistry = new IndexedDbPhraseRegistryRepository();
    this.sentenceAnalysisCache = new IndexedDbSentenceAnalysisCacheRepository();
  }

  boot() {
    if (this.isBooted) {
      return;
    }

    this.isBooted = true;
    void this.prepareAssetPacks();
    void this.backfillLearningItemBands();
    void this.cleanupLegacyPhraseIdentities();

    chrome.runtime.onInstalled.addListener((details) => {
      console.info("ImmersionKit background service worker installed.");
      if (details.reason === "install") {
        void showFirstRunGuidance();
      }
      void this.prepareAssetPacks();
      void this.backfillLearningItemBands();
      void this.cleanupLegacyPhraseIdentities();
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!isRuntimeMessage(message)) {
        return false;
      }

      if (message.type === RuntimeMessageType.Ping) {
        const response: PingResponse = {
          ok: true,
          source: "background",
          timestamp: new Date().toISOString()
        };
        sendResponse(response);
        return false;
      }

      if (message.type === RuntimeMessageType.RefreshActiveTab) {
        void this.handleRefreshActiveTab(sendResponse);
        return true;
      }

      if (message.type === RuntimeMessageType.GetLearningItems) {
        void this.handleGetLearningItems(message, sendResponse);
        return true;
      }

      if (message.type === RuntimeMessageType.GetAssetContext) {
        void this.handleGetAssetContext(sendResponse);
        return true;
      }

      if (message.type === RuntimeMessageType.GetSentenceAnalysisCache) {
        void this.handleGetSentenceAnalysisCache(message.sentenceHashes, sendResponse);
        return true;
      }

      if (message.type === RuntimeMessageType.GraduateCheckpoint) {
        void this.handleGraduateCheckpoint(sendResponse);
        return true;
      }

      if (message.type === RuntimeMessageType.QueueSentenceCandidates) {
        void this.handleQueueSentenceCandidates(message, sender, sendResponse);
        return true;
      }

      if (message.type === RuntimeMessageType.AssistEvent) {
        void this.handleAssistEvent(message, sendResponse);
        return true;
      }

      if (message.type === RuntimeMessageType.QualifiedExposureEvent) {
        void this.handleQualifiedExposureEvent(message, sender, sendResponse);
        return true;
      }

      return false;
    });
  }

  private async handleRefreshActiveTab(
    sendResponse: (response: RefreshActiveTabResponse | ErrorResponse) => void
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

  private async cleanupLegacyPhraseIdentities(): Promise<void> {
    try {
      const result = await this.phraseRegistry.cleanupLegacyBlankTargetDuplicates();
      if (result.removedRegistryEntries > 0 || result.removedLearningItems > 0) {
        console.info("ImmersionKit cleaned legacy phrase identities.", result);
      }
    } catch (error) {
      console.warn("ImmersionKit legacy phrase cleanup failed.", error);
    }
  }

  private async handleQueueSentenceCandidates(
    message: QueueSentenceCandidatesMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: QueueSentenceCandidatesResponse | ErrorResponse) => void
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
    sendResponse: (response: GetAssetContextResponse) => void
  ) {
    try {
      sendResponse({
        ok: true,
        context: await this.assetPacks.loadActiveContext()
      });
    } catch (error) {
      console.warn("ImmersionKit asset context read failed.", error);
      sendResponse({
        ok: false,
        error: "asset-context-read-failed"
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
    sendResponse: (response: { ok: true; stored: boolean } | ErrorResponse) => void
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
    sendResponse: (response: { ok: true; stored: boolean } | ErrorResponse) => void
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
          console.info("ImmersionKit sentence translation delivery skipped.", {
            tabId: delivery.tabId
          });
        }
      })
    );
  }

  private async prepareAssetPacks() {
    try {
      const context = await this.assetPacks.loadActiveContext();
      console.info("ImmersionKit asset packs ready.", {
        source: context.source,
        entryCount: context.lexicon.length,
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
        console.info("ImmersionKit learning item band backfill checked.", result);
      }
    } catch (error) {
      console.warn("ImmersionKit learning item band backfill failed.", error);
    }
  }
}

async function showFirstRunGuidance(): Promise<void> {
  await new Promise<void>((resolve) => {
    chrome.storage.local.set({ [FIRST_RUN_INTRO_STORAGE_KEY]: true }, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });

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
