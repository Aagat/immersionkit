import {
  DEFAULT_EXTENSION_SETTINGS,
  createFallbackLanguagePairDefinition,
  getLanguagePairDefinition,
  type ActiveAssetContext,
  type ContentAnalysisContextSnapshot,
  type ContentContextSnapshot,
  type RenderUnitEntry,
  type SentenceAnalysisEntry,
  type SiteSetting,
  type UserVocabEntry
} from "@immersionkit/shared";
import { getBackgroundAssetPackService } from "./asset-packs";
import { BackgroundLearningItemService } from "./learning-items";
import { IndexedDbSentenceAnalysisCacheRepository } from "./sentence-analysis-cache";
import { loadBackgroundRuntimeConfig } from "./settings";
import { loadUserDataValues } from "../storage/user-data-repository";
import { isRecord, pickFirstDefinedValue, readString } from "../storage/serialization";
import { USER_DATA_KEYS } from "../shared/user-data-keys";
import { IndexedDbUserVocabRepository } from "../storage/user-data-repository";
import { WINK_NLP_ANALYZER_VERSION } from "./sentence-analyzers";
import {
  buildSentenceAnalysisVersion,
  getRuntimePhraseTargetsForLanguagePair
} from "./sentence-analysis-version";
import { BackgroundAccountService } from "./account-service";

const SITE_SETTINGS_STORAGE_KEYS = [USER_DATA_KEYS.siteSettings] as const;
const MAX_CONTENT_CONTEXT_LEARNING_UNIT_REF_IDS = 500;

export class ContentContextService {
  private readonly assetPacks = getBackgroundAssetPackService();
  private readonly sentenceAnalysisCache = new IndexedDbSentenceAnalysisCacheRepository();
  private readonly learningItems = new BackgroundLearningItemService();
  private readonly userVocab = new IndexedDbUserVocabRepository();
  private readonly accountService = new BackgroundAccountService();

  async loadContext(input: {
    hostname: string;
    sentenceHashes?: readonly string[];
  }): Promise<ContentContextSnapshot> {
    const [runtimeConfig, siteSettingsStorage, readingAllowed] =
      await Promise.all([
        loadBackgroundRuntimeConfig(),
        loadUserDataValues([...SITE_SETTINGS_STORAGE_KEYS]),
        this.accountService.isReadingAllowed()
      ]);
    const siteSetting = parseSiteSetting(
      pickFirstDefinedValue(siteSettingsStorage, SITE_SETTINGS_STORAGE_KEYS),
      input.hostname
    );
    const discoveryRate = clampUnitInterval(
      siteSetting?.discoveryRate ?? runtimeConfig.settings.discoveryRate
    );
    const siteEnabled =
      runtimeConfig.settings.enabled &&
      readingAllowed &&
      (siteSetting?.enabled ?? true);

    if (!siteEnabled) {
      return {
        settings: runtimeConfig.settings,
        discoveryRate,
        siteSetting,
        siteEnabled,
        assetContext: createEmptyAssetContext(runtimeConfig.settings.languagePair),
        vocabEntries: [],
        learningItems: [],
        sentenceAnalysisEntries: [],
        curriculumConfig: runtimeConfig.curriculum.config,
        learningProfile: runtimeConfig.curriculum.profile
      };
    }

    const assetContext = await this.assetPacks.loadActiveContext();
    const sentenceAnalysisEntries = await this.loadAnalysisEntries(
      input.sentenceHashes,
      assetContext
    );
    const relevantUnitRefIds = collectRelevantUnitRefIds(
      assetContext.renderUnits,
      sentenceAnalysisEntries
    );
    const [vocabEntries, learningItems] = await Promise.all([
      this.loadVocabEntries(relevantUnitRefIds.lexemeIds),
      this.learningItems.listItemsByUnitRefIds(
        relevantUnitRefIds.learningUnitRefIds.slice(
          0,
          MAX_CONTENT_CONTEXT_LEARNING_UNIT_REF_IDS
        )
      )
    ]);

    return {
      settings: runtimeConfig.settings,
      discoveryRate,
      siteSetting,
      siteEnabled,
      assetContext,
      vocabEntries,
      learningItems,
      sentenceAnalysisEntries,
      curriculumConfig: runtimeConfig.curriculum.config,
      learningProfile: runtimeConfig.curriculum.profile
    };
  }

  async loadAnalysisContext(
    sentenceHashes: readonly string[]
  ): Promise<ContentAnalysisContextSnapshot> {
    const assetContext = await this.assetPacks.loadActiveContext();
    const entries = await this.loadAnalysisEntries(sentenceHashes, assetContext);
    return {
      entryCount: entries.length,
      entries
    };
  }

  private async loadAnalysisEntries(
    sentenceHashes: readonly string[] | undefined,
    assetContext: Pick<ActiveAssetContext, "languagePair" | "renderUnits">
  ): Promise<SentenceAnalysisEntry[]> {
    const requestedHashes = Array.isArray(sentenceHashes)
      ? [...new Set(sentenceHashes.map((hash) => hash.trim()).filter(Boolean))]
          .slice(0, 500)
      : [];
    if (requestedHashes.length === 0) {
      return [];
    }

    const pairDefinition =
      getLanguagePairDefinition(assetContext.languagePair) ??
      createFallbackLanguagePairDefinition(assetContext.languagePair);
    const analysisVersion = buildSentenceAnalysisVersion(
      WINK_NLP_ANALYZER_VERSION,
      assetContext.renderUnits,
      getRuntimePhraseTargetsForLanguagePair(assetContext.languagePair),
      pairDefinition.fixedPhraseLexicon,
      assetContext.languagePair
    );

    return this.sentenceAnalysisCache.listBySentenceHashes(
      requestedHashes,
      analysisVersion
    );
  }

  private async loadVocabEntries(
    lexemeIds: readonly string[]
  ): Promise<UserVocabEntry[]> {
    const requestedLexemeIds = new Set(
      lexemeIds.map((lexemeId) => lexemeId.trim()).filter(Boolean)
    );
    const entries = [...(await this.userVocab.loadAll()).values()];
    return requestedLexemeIds.size > 0
      ? entries.filter((entry) => requestedLexemeIds.has(entry.lexemeId))
      : entries;
  }
}

function createEmptyAssetContext(languagePair: ActiveAssetContext["languagePair"]): ActiveAssetContext {
  return {
    languagePair,
    renderUnits: [],
    sentenceHintPhrases: [],
    source: "empty",
    assetVersion: null,
    bandIds: [],
    missingBandIds: []
  };
}

export function collectRelevantUnitRefIds(
  renderUnits: readonly RenderUnitEntry[],
  analysisEntries: readonly SentenceAnalysisEntry[]
): {
  lexemeIds: string[];
  learningUnitRefIds: string[];
} {
  const lexemeIds = new Set<string>();
  const pageLearningUnitRefIds = new Set<string>();
  const assetLearningUnitRefIds = new Set<string>();

  for (const renderUnit of renderUnits) {
    for (const lexemeId of renderUnit.lexemeIds) {
      if (lexemeId.trim()) {
        lexemeIds.add(lexemeId);
        assetLearningUnitRefIds.add(lexemeId);
      }
    }
  }

  for (const entry of analysisEntries) {
    for (const candidate of entry.contextualWordCandidates) {
      const lexemeId = candidate.lexemeId?.trim();
      if (lexemeId) {
        lexemeIds.add(lexemeId);
        pageLearningUnitRefIds.add(lexemeId);
      }
    }

    for (const phraseMatch of entry.phraseMatches) {
      if (phraseMatch.phraseId.trim()) {
        pageLearningUnitRefIds.add(phraseMatch.phraseId);
      }
    }

    for (const grammarFeature of entry.grammarFeatures) {
      if (grammarFeature.featureKey.trim()) {
        pageLearningUnitRefIds.add(grammarFeature.featureKey);
      }
    }
  }

  for (const unitRefId of pageLearningUnitRefIds) {
    assetLearningUnitRefIds.delete(unitRefId);
  }

  return {
    lexemeIds: [...lexemeIds],
    learningUnitRefIds: [...pageLearningUnitRefIds, ...assetLearningUnitRefIds]
  };
}

function parseSiteSetting(input: unknown, hostname: string): SiteSetting | null {
  if (!isRecord(input)) {
    return null;
  }

  const candidate = input[hostname];
  if (!isRecord(candidate)) {
    return null;
  }

  const candidateHostname = readString(candidate.hostname) ?? hostname;
  if (candidateHostname !== hostname) {
    return null;
  }

  return {
    hostname,
    enabled: typeof candidate.enabled === "boolean" ? candidate.enabled : true,
    discoveryRate:
      typeof candidate.discoveryRate === "number" &&
      Number.isFinite(candidate.discoveryRate)
        ? clampUnitInterval(candidate.discoveryRate)
        : null,
    sentenceTranslationEnabled:
      typeof candidate.sentenceTranslationEnabled === "boolean"
        ? candidate.sentenceTranslationEnabled
        : null,
    updatedAt: readString(candidate.updatedAt) ?? new Date().toISOString()
  };
}

function clampUnitInterval(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_EXTENSION_SETTINGS.discoveryRate;
  }

  return Math.max(0, Math.min(1, value));
}
