import {
  RuntimeMessageType,
  type ContentContextSnapshot,
  type CurriculumConfig,
  type CurriculumRuntimeProfileInput,
  type ExtensionSettings,
  type LearningItem,
  type RenderUnitEntry,
  type SiteSetting,
  type UserVocabEntry,
  type VocabStatus
} from "@immersionkit/shared";
import { sendRuntimeMessage } from "../runtime-client";
import {
  buildCachedSentenceAnalysisContext,
  type CachedGrammarFeature,
  type CachedPhraseMatch,
  type CachedSentenceAnalysisContext,
  type CachedWordRenderDecision,
  type RuntimeAnalysisContext
} from "./runtime-analysis";

export type RenderAssetLoadSource =
  | "remote-pack"
  | "cached-pack"
  | "empty";

export type RenderAssetLoadInfo = {
  source: RenderAssetLoadSource;
  entryCount: number;
  assetVersion: string | null;
  isFallback: boolean;
};

export type ProcessingContext = {
  settings: ExtensionSettings;
  discoveryRate: number;
  siteSetting: SiteSetting | null;
  siteEnabled: boolean;
  renderUnits: RenderUnitEntry[];
  renderAssetInfo: RenderAssetLoadInfo;
  vocabByLexemeId: Map<string, UserVocabEntry>;
  learningItemsByUnitRefId: Map<string, LearningItem>;
  cachedWordRenderDecisions: Map<string, CachedWordRenderDecision[]>;
  cachedPhraseMatchesBySentenceHash: Map<string, CachedPhraseMatch[]>;
  sentenceHintPhrases: string[];
  cachedGrammarFeaturesBySentenceHash: Map<string, CachedGrammarFeature[]>;
  analysisContext: RuntimeAnalysisContext;
  curriculumConfig: CurriculumConfig;
  learningProfile: CurriculumRuntimeProfileInput;
};

export type PersistVocabStatusInput = {
  lexemeId: string;
  status: VocabStatus;
  lastSeenAt?: string | null;
  updatedAt?: string;
  incrementExposure?: boolean;
};

export async function loadProcessingContext(
  hostname: string,
  sentenceHashes: readonly string[] = []
): Promise<ProcessingContext> {
  const response = await sendRuntimeMessage({
    type: RuntimeMessageType.LoadContentContext,
    hostname,
    sentenceHashes: [...new Set(sentenceHashes)].slice(0, 500)
  });

  if (!response?.ok) {
    throw new Error(response?.error ?? "content-context-load-failed");
  }

  return buildProcessingContext(response.context);
}

export async function loadCachedSentenceAnalysisContext(
  sentenceHashes: readonly string[]
): Promise<CachedSentenceAnalysisContext> {
  const response = await sendRuntimeMessage({
    type: RuntimeMessageType.GetContentAnalysisContext,
    sentenceHashes: [...new Set(sentenceHashes)].slice(0, 500)
  });

  if (!response?.ok) {
    return buildCachedSentenceAnalysisContext([]);
  }

  return buildCachedSentenceAnalysisContext(response.context.entries);
}

export async function persistVocabStatus(
  input: PersistVocabStatusInput
): Promise<UserVocabEntry | null> {
  const lexemeId = input.lexemeId.trim();
  if (!lexemeId) {
    return null;
  }

  const response = await sendRuntimeMessage({
    type: RuntimeMessageType.SetVocabStatus,
    lexemeId,
    status: input.status,
    lastSeenAt: input.lastSeenAt,
    updatedAt: input.updatedAt,
    incrementExposure: input.incrementExposure
  });

  return response?.ok ? response.entry : null;
}

export async function refreshLearningItemsByUnitRefIds(
  unitRefIds: readonly string[]
): Promise<Map<string, LearningItem>> {
  const requestedUnitRefIds = [...new Set(unitRefIds.map((id) => id.trim()).filter(Boolean))]
    .slice(0, 100);
  if (requestedUnitRefIds.length === 0) {
    return new Map();
  }

  const response = await sendRuntimeMessage({
    type: RuntimeMessageType.GetLearningItems,
    unitRefIds: requestedUnitRefIds
  });

  return response?.ok ? mapLearningItems(response.items) : new Map();
}

function buildProcessingContext(snapshot: ContentContextSnapshot): ProcessingContext {
  const sentenceAnalysisContext = buildCachedSentenceAnalysisContext(
    snapshot.sentenceAnalysisEntries
  );

  return {
    settings: snapshot.settings,
    discoveryRate: snapshot.discoveryRate,
    siteSetting: snapshot.siteSetting,
    siteEnabled: snapshot.siteEnabled,
    renderUnits: snapshot.assetContext.renderUnits,
    renderAssetInfo: {
      source: snapshot.assetContext.source,
      entryCount: snapshot.assetContext.renderUnits.length,
      assetVersion: snapshot.assetContext.assetVersion,
      isFallback: snapshot.assetContext.source === "empty"
    },
    sentenceHintPhrases: snapshot.assetContext.sentenceHintPhrases,
    vocabByLexemeId: new Map(
      snapshot.vocabEntries.map((entry) => [entry.lexemeId, entry])
    ),
    learningItemsByUnitRefId: mapLearningItems(snapshot.learningItems),
    cachedWordRenderDecisions:
      sentenceAnalysisContext.cachedWordRenderDecisions,
    cachedPhraseMatchesBySentenceHash:
      sentenceAnalysisContext.cachedPhraseMatchesBySentenceHash,
    cachedGrammarFeaturesBySentenceHash:
      sentenceAnalysisContext.cachedGrammarFeaturesBySentenceHash,
    analysisContext: sentenceAnalysisContext.analysisContext,
    curriculumConfig: snapshot.curriculumConfig,
    learningProfile: snapshot.learningProfile
  };
}

function mapLearningItems(items: readonly LearningItem[]): Map<string, LearningItem> {
  return new Map(items.map((item) => [item.unitRefId, item]));
}
