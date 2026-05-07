import {
  DEFAULT_EXTENSION_SETTINGS,
  RuntimeMessageType,
  clampUnitInterval,
  evaluateCurriculumBandTransition,
  getActiveCurriculumContent,
  resolveActiveCurriculumBand,
  resolveCurriculumConfig,
  resolveExtensionSettings,
  type CurriculumBandContent,
  type CurriculumRuntimeProfileInput,
  type ExtensionSettings,
  type LearningItem,
  type ProviderName,
  type ResolvedExtensionSettings,
  type SiteSetting
} from "@immersionkit/shared";
import {
  PAGE_DIAGNOSTICS_MESSAGE_TYPE,
  type PageDiagnosticsSnapshot
} from "../diagnostics/page-diagnostics";
import {
  INDEXEDDB_STORES,
  countIndexedDbStore
} from "../background/indexeddb";
import { IndexedDbLearningItemRepository } from "../background/learning-item-repository";
import {
  IndexedDbUserVocabRepository,
  loadUserDataValues as loadIndexedDbUserDataValues,
  removeUserDataValues as removeIndexedDbUserDataValues,
  setUserDataValues as setIndexedDbUserDataValues
} from "../background/user-data-repository";
import { USER_DATA_KEYS } from "../shared/user-data-keys";

type StorageRecord = Record<string, unknown>;

export const SETTINGS_STORAGE_KEYS = [USER_DATA_KEYS.settings] as const;
export const SITE_SETTINGS_STORAGE_KEYS = [USER_DATA_KEYS.siteSettings] as const;
export const PROVIDER_API_KEY_STORAGE_KEYS = [
  USER_DATA_KEYS.providerOpenAiApiKey
] as const;
export const LEARNING_PROFILE_STORAGE_KEYS = [USER_DATA_KEYS.learningProfile] as const;
export const CURRICULUM_PROGRESSION_DIAGNOSTICS_STORAGE_KEYS = [
  USER_DATA_KEYS.curriculumProgressionDiagnostics
] as const;
export const FIRST_RUN_INTRO_STORAGE_KEY = USER_DATA_KEYS.firstRunIntro;

export type ProficiencySeed = "beginner" | "intermediate" | "advanced";

export const PROFICIENCY_SEED_OPTIONS: readonly {
  id: ProficiencySeed;
  label: string;
  description: string;
}[] = [
  {
    id: "beginner",
    label: "Beginner",
    description: "Start from the highest-frequency English words first."
  },
  {
    id: "intermediate",
    label: "Intermediate",
    description: "Blend frequent words with medium-frequency vocabulary."
  },
  {
    id: "advanced",
    label: "Advanced",
    description: "Bias toward less frequent discovery vocabulary."
  }
] as const;

const PROFICIENCY_SEED_SET: ReadonlySet<ProficiencySeed> = new Set(
  PROFICIENCY_SEED_OPTIONS.map((option) => option.id)
);

const CANONICAL_SETTINGS_STORAGE_KEY = SETTINGS_STORAGE_KEYS[0];
const CANONICAL_SITE_SETTINGS_STORAGE_KEY = SITE_SETTINGS_STORAGE_KEYS[0];
const CANONICAL_PROVIDER_API_KEY_STORAGE_KEY = PROVIDER_API_KEY_STORAGE_KEYS[0];

export type SettingsState = {
  rawSettings: StorageRecord;
  settings: ResolvedExtensionSettings;
  proficiencySeed: ProficiencySeed;
  providerApiKey: string;
};

export type ActiveTabContext = {
  tabId: number | null;
  hostname: string | null;
  url: string | null;
  isSupportedPage: boolean;
  supportMessage: string;
};

export type StoredSiteSetting = SiteSetting & {
  sentenceTranslationEnabled?: boolean | null;
};

export type SiteSettingsMap = Record<string, StoredSiteSetting>;

export type VocabStats = {
  total: number;
  newCount: number;
  learning: number;
  known: number;
  ignored: number;
};

export type SentenceStats = {
  cacheSize: number;
  pendingCount: number;
};

export type PageDiagnostics = PageDiagnosticsSnapshot;

export type CurriculumProgressionDiagnostics = {
  decidedAt: string;
  configId: string;
  previousBandId: string | null;
  nextBandId: string | null;
  eligible: boolean;
  reason: string;
  unmetRequirements: string[];
  checkpointBoundary: boolean;
  activeVocabularyBandId: string | null;
  activePhraseBandId: string | null;
  activeGrammarBandId: string | null;
  unlockedBandIds: string[];
};

export type CurriculumDiagnostics = {
  profile: CurriculumRuntimeProfileInput;
  activeContent: ActiveCurriculumContentSummary | null;
  lastProgressionDecision: CurriculumProgressionDiagnostics | null;
};

export type ActiveCurriculumContentSummary = {
  bandId: string;
  bandLabel: string;
  vocabularyDomains: readonly string[];
  phraseChunks: readonly string[];
  currentGrammarKeys: readonly string[];
  plannedGrammarKeys: readonly string[];
  sentenceTokenRange: readonly [number, number];
  sentenceClausePolicy: string;
  sentenceTargetPolicy: string;
  sentenceNotes: string;
};

export type GrammarEvidenceStats = {
  featureCount: number;
  assistCount: number;
  qualifiedExposureCount: number;
  dueCount: number;
};

export type CheckpointEligibilityPreview = {
  activeBandId: string | null;
  activeBandLabel: string | null;
  nextBandId: string | null;
  nextBandLabel: string | null;
  checkpointRequired: boolean;
  checkpointIsOnlyBlocker: boolean;
  unmetRequirements: string[];
};

export type CheckpointGraduationResult = {
  advanced: boolean;
  previousBandId: string | null;
  nextBandId: string | null;
  reason: string;
  unmetRequirements: string[];
};

export async function loadSettingsState(): Promise<SettingsState> {
  const storage = await getUserDataValues([
    ...SETTINGS_STORAGE_KEYS,
    ...PROVIDER_API_KEY_STORAGE_KEYS
  ]);

  const rawCandidate = pickFirstDefinedValue(storage, SETTINGS_STORAGE_KEYS);
  const rawSettings = isRecord(rawCandidate) ? { ...rawCandidate } : {};

  return {
    rawSettings,
    settings: resolveExtensionSettings(rawSettings as Partial<ExtensionSettings>),
    proficiencySeed: parseProficiencySeed(rawSettings.proficiencySeed),
    providerApiKey:
      readString(pickFirstDefinedValue(storage, PROVIDER_API_KEY_STORAGE_KEYS)) ?? ""
  };
}

export async function saveSettingsState(state: SettingsState): Promise<SettingsState> {
  const nextRawSettings: StorageRecord = {
    ...state.rawSettings,
    ...state.settings,
    targetLanguage: "es",
    proficiencySeed: state.proficiencySeed
  };

  await setUserDataRuntimeValues({
    [CANONICAL_SETTINGS_STORAGE_KEY]: nextRawSettings
  });

  await persistProviderApiKey(state.providerApiKey);

  return {
    ...state,
    rawSettings: nextRawSettings,
    providerApiKey: state.providerApiKey.trim()
  };
}

export async function loadSiteSettingsMap(): Promise<SiteSettingsMap> {
  const storage = await getUserDataValues([...SITE_SETTINGS_STORAGE_KEYS]);
  const value = pickFirstDefinedValue(storage, SITE_SETTINGS_STORAGE_KEYS);
  return normalizeSiteSettingsMap(value);
}

export async function saveSiteSettingsMap(siteSettings: SiteSettingsMap): Promise<void> {
  await setUserDataRuntimeValues({
    [CANONICAL_SITE_SETTINGS_STORAGE_KEY]: siteSettings
  });
}

export async function upsertSiteEnabledState(
  hostname: string,
  enabled: boolean,
  currentSiteSettings?: SiteSettingsMap
): Promise<SiteSettingsMap> {
  const draft = currentSiteSettings
    ? { ...currentSiteSettings }
    : await loadSiteSettingsMap();

  const previous = draft[hostname];
  draft[hostname] = {
    hostname,
    enabled,
    discoveryRate: previous?.discoveryRate ?? null,
    sentenceTranslationEnabled: previous?.sentenceTranslationEnabled ?? null,
    updatedAt: new Date().toISOString()
  };

  await saveSiteSettingsMap(draft);
  return draft;
}

export function getSiteEnabledForHost(
  siteSettings: SiteSettingsMap,
  hostname: string | null
): boolean {
  if (!hostname) {
    return true;
  }

  return siteSettings[hostname]?.enabled ?? true;
}

export async function loadVocabStats(): Promise<VocabStats> {
  const statuses = [...(await new IndexedDbUserVocabRepository().loadAll()).values()]
    .map((entry) => entry.status);

  const stats: VocabStats = {
    total: statuses.length,
    newCount: 0,
    learning: 0,
    known: 0,
    ignored: 0
  };

  for (const status of statuses) {
    if (status === "known") {
      stats.known += 1;
      continue;
    }

    if (status === "learning") {
      stats.learning += 1;
      continue;
    }

    if (status === "ignored") {
      stats.ignored += 1;
      continue;
    }

    stats.newCount += 1;
  }

  return stats;
}

export async function loadSentenceStats(): Promise<SentenceStats> {
  const indexedDbCacheSize = await countIndexedDbStore(
    INDEXEDDB_STORES.sentenceCache
  );

  return {
    cacheSize: indexedDbCacheSize ?? 0,
    pendingCount: 0
  };
}

export async function loadCurriculumDiagnostics(): Promise<CurriculumDiagnostics> {
  const storage = await getUserDataValues([
    ...LEARNING_PROFILE_STORAGE_KEYS,
    ...CURRICULUM_PROGRESSION_DIAGNOSTICS_STORAGE_KEYS
  ]);
  const profile = parseLearningProfile(
    pickFirstDefinedValue(storage, LEARNING_PROFILE_STORAGE_KEYS)
  );

  return {
    profile,
    activeContent: summarizeActiveCurriculumContent(profile),
    lastProgressionDecision: parseCurriculumProgressionDiagnostics(
      pickFirstDefinedValue(storage, CURRICULUM_PROGRESSION_DIAGNOSTICS_STORAGE_KEYS)
    )
  };
}

export async function loadGrammarEvidenceStats(): Promise<GrammarEvidenceStats> {
  const repository = new IndexedDbLearningItemRepository();
  return summarizeGrammarEvidenceStats(Object.values(await repository.loadAll()));
}

export async function loadCheckpointEligibilityPreview(): Promise<CheckpointEligibilityPreview> {
  const [curriculumDiagnostics, itemsById] = await Promise.all([
    loadCurriculumDiagnostics(),
    new IndexedDbLearningItemRepository().loadAll()
  ]);

  return summarizeCheckpointEligibilityPreview({
    profile: curriculumDiagnostics.profile,
    items: Object.values(itemsById)
  });
}

export async function loadFirstRunIntroVisible(): Promise<boolean> {
  const storage = await getUserDataValues([FIRST_RUN_INTRO_STORAGE_KEY]);
  return storage[FIRST_RUN_INTRO_STORAGE_KEY] !== false;
}

export async function markFirstRunIntroSeen(): Promise<void> {
  await setUserDataRuntimeValues({
    [FIRST_RUN_INTRO_STORAGE_KEY]: false
  });
}

export async function graduateCheckpoint(): Promise<CheckpointGraduationResult> {
  const response = await sendRuntimeMessage<
    | ({ ok: true } & CheckpointGraduationResult)
    | { ok: false; error?: string }
  >({
    type: RuntimeMessageType.GraduateCheckpoint
  });

  if (!response?.ok) {
    throw new Error(response?.error ?? "checkpoint-graduation-unavailable");
  }

  return {
    advanced: response.advanced,
    previousBandId: response.previousBandId,
    nextBandId: response.nextBandId,
    reason: response.reason,
    unmetRequirements: response.unmetRequirements
  };
}

export function summarizeCheckpointEligibilityPreview(input: {
  profile?: CurriculumRuntimeProfileInput | null;
  items: readonly LearningItem[];
  now?: string;
}): CheckpointEligibilityPreview {
  const config = resolveCurriculumConfig(null);
  const activeBand = resolveActiveCurriculumBand(config, "word", input.profile);
  if (!activeBand) {
    return {
      activeBandId: null,
      activeBandLabel: null,
      nextBandId: null,
      nextBandLabel: null,
      checkpointRequired: false,
      checkpointIsOnlyBlocker: false,
      unmetRequirements: ["unknown-active-band"]
    };
  }

  const recentLapseRate = estimateRecentLapseRate(
    input.items,
    input.now ?? new Date().toISOString()
  );
  const blockedDecision = evaluateCurriculumBandTransition(config, {
    bandId: activeBand.bandId,
    items: input.items,
    recentLapseRate,
    checkpointPassed: false
  });
  const afterCheckpointDecision = evaluateCurriculumBandTransition(config, {
    bandId: activeBand.bandId,
    items: input.items,
    recentLapseRate,
    checkpointPassed: true
  });

  return {
    activeBandId: activeBand.bandId,
    activeBandLabel: activeBand.label,
    nextBandId: blockedDecision.nextBand?.bandId ?? null,
    nextBandLabel: blockedDecision.nextBand?.label ?? null,
    checkpointRequired: activeBand.unlockRequirements.checkpointRequired,
    checkpointIsOnlyBlocker:
      blockedDecision.unmetRequirements.includes("checkpoint") &&
      afterCheckpointDecision.eligible &&
      Boolean(afterCheckpointDecision.nextBand),
    unmetRequirements: blockedDecision.unmetRequirements
  };
}

export function summarizeGrammarEvidenceStats(
  items: readonly LearningItem[],
  nowMs: number = Date.now()
): GrammarEvidenceStats {
  const stats: GrammarEvidenceStats = {
    featureCount: 0,
    assistCount: 0,
    qualifiedExposureCount: 0,
    dueCount: 0
  };

  for (const item of items) {
    if (item.unitType !== "grammar-feature" || item.suspended) {
      continue;
    }

    stats.featureCount += 1;
    stats.assistCount += item.assistCount;
    stats.qualifiedExposureCount += item.qualifiedExposureCount;

    const nextReviewMs = item.nextReviewAt ? Date.parse(item.nextReviewAt) : NaN;
    if (Number.isFinite(nextReviewMs) && nextReviewMs <= nowMs) {
      stats.dueCount += 1;
    }
  }

  return stats;
}

export function summarizeActiveCurriculumContent(
  profile?: CurriculumRuntimeProfileInput | null
): ActiveCurriculumContentSummary | null {
  const active = getActiveCurriculumContent({ profile });
  if (!active.band || !active.content) {
    return null;
  }

  return toActiveCurriculumContentSummary(active.band.bandId, active.band.label, active.content);
}

function toActiveCurriculumContentSummary(
  bandId: string,
  bandLabel: string,
  content: CurriculumBandContent
): ActiveCurriculumContentSummary {
  return {
    bandId,
    bandLabel,
    vocabularyDomains: content.vocabularyDomains,
    phraseChunks: content.phraseChunks,
    currentGrammarKeys: content.currentGrammarKeys,
    plannedGrammarKeys: content.plannedGrammarKeys,
    sentenceTokenRange: content.sentencePolicy.tokenRange,
    sentenceClausePolicy: content.sentencePolicy.clausePolicy,
    sentenceTargetPolicy: content.sentencePolicy.targetPolicy,
    sentenceNotes: content.sentencePolicy.notes
  };
}

function estimateRecentLapseRate(
  items: readonly LearningItem[],
  now: string = new Date().toISOString()
): number {
  const nowMs = Date.parse(now);
  const recentItems = items.filter((item) => {
    const introducedAt = Date.parse(item.introducedAt);
    return (
      Number.isFinite(nowMs) &&
      Number.isFinite(introducedAt) &&
      nowMs - introducedAt <= 14 * 24 * 60 * 60 * 1000
    );
  });
  const evaluatedItems = recentItems.length > 0 ? recentItems : items;
  if (evaluatedItems.length === 0) {
    return 0;
  }

  return evaluatedItems.filter((item) => item.lapses > 0).length / evaluatedItems.length;
}

export async function loadActiveTabContext(): Promise<ActiveTabContext> {
  if (typeof chrome === "undefined" || !chrome.tabs?.query) {
    return {
      tabId: null,
      hostname: null,
      url: null,
      isSupportedPage: false,
      supportMessage: "Chrome tab APIs are unavailable in this context."
    };
  }

  const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (result) => {
      if (chrome.runtime.lastError) {
        resolve([]);
        return;
      }

      resolve(result ?? []);
    });
  });

  const activeTab = tabs[0];
  if (!activeTab?.url) {
    return {
      tabId: activeTab?.id ?? null,
      hostname: null,
      url: null,
      isSupportedPage: false,
      supportMessage: "Open an HTTP(S) page to configure site controls."
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(activeTab.url);
  } catch {
    return {
      tabId: activeTab.id ?? null,
      hostname: null,
      url: activeTab.url,
      isSupportedPage: false,
      supportMessage: "The active tab URL could not be parsed."
    };
  }

  const isSupportedPage =
    parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";

  if (!isSupportedPage) {
    return {
      tabId: activeTab.id ?? null,
      hostname: null,
      url: activeTab.url,
      isSupportedPage: false,
      supportMessage: "ImmersionKit controls only apply to HTTP(S) pages."
    };
  }

  return {
    tabId: activeTab.id ?? null,
    hostname: parsedUrl.hostname,
    url: activeTab.url,
    isSupportedPage: true,
    supportMessage: parsedUrl.hostname
  };
}

export async function loadPageDiagnostics(
  tabId: number | null | undefined
): Promise<PageDiagnostics | null> {
  if (typeof tabId !== "number") {
    return null;
  }

  const diagnostics = await sendTabMessage<PageDiagnostics>(tabId, {
    type: PAGE_DIAGNOSTICS_MESSAGE_TYPE
  });

  return diagnostics;
}

export async function pingBackground(): Promise<boolean> {
  const response = await sendRuntimeMessage<{ ok?: boolean }>({
    type: RuntimeMessageType.Ping
  });

  return Boolean(response?.ok);
}

export async function notifySettingsRefresh(tabId?: number | null): Promise<void> {
  await sendRuntimeMessage({ type: RuntimeMessageType.RefreshActiveTab });

  if (typeof tabId !== "number") {
    return;
  }

  await sendTabMessage(tabId, { type: RuntimeMessageType.RefreshActiveTab });
}

export function parseProficiencySeed(value: unknown): ProficiencySeed {
  if (typeof value !== "string") {
    return "beginner";
  }

  return PROFICIENCY_SEED_SET.has(value as ProficiencySeed)
    ? (value as ProficiencySeed)
    : "beginner";
}

export function isProviderKeyValid(provider: ProviderName, apiKey: string): boolean {
  if (provider === "none") {
    return true;
  }

  const trimmed = apiKey.trim();
  return trimmed.startsWith("sk-") && trimmed.length >= 20;
}

export function normalizeDiscoveryRate(value: number): number {
  return clampUnitInterval(value, DEFAULT_EXTENSION_SETTINGS.discoveryRate);
}

async function persistProviderApiKey(apiKey: string): Promise<void> {
  const trimmed = apiKey.trim();

  if (trimmed.length === 0) {
    await removeUserDataRuntimeKeys([...PROVIDER_API_KEY_STORAGE_KEYS]);
    return;
  }

  await setUserDataRuntimeValues({
    [CANONICAL_PROVIDER_API_KEY_STORAGE_KEY]: trimmed
  });
}

function normalizeSiteSettingsMap(input: unknown): SiteSettingsMap {
  if (Array.isArray(input)) {
    return input.reduce<SiteSettingsMap>((accumulator, entry) => {
      if (!isRecord(entry)) {
        return accumulator;
      }

      const hostname = readString(entry.hostname);
      if (!hostname) {
        return accumulator;
      }

      accumulator[hostname] = normalizeSiteSetting(hostname, entry);
      return accumulator;
    }, {});
  }

  if (!isRecord(input)) {
    return {};
  }

  if (readString(input.hostname)) {
    const hostname = readString(input.hostname);
    if (!hostname) {
      return {};
    }

    return {
      [hostname]: normalizeSiteSetting(hostname, input)
    };
  }

  const map: SiteSettingsMap = {};
  for (const [hostname, value] of Object.entries(input)) {
    if (!isRecord(value)) {
      continue;
    }

    map[hostname] = normalizeSiteSetting(hostname, value);
  }

  return map;
}

function normalizeSiteSetting(hostname: string, input: StorageRecord): StoredSiteSetting {
  return {
    hostname,
    enabled: typeof input.enabled === "boolean" ? input.enabled : true,
    discoveryRate:
      typeof input.discoveryRate === "number" && Number.isFinite(input.discoveryRate)
        ? clampUnitInterval(input.discoveryRate, DEFAULT_EXTENSION_SETTINGS.discoveryRate)
        : null,
    sentenceTranslationEnabled:
      typeof input.sentenceTranslationEnabled === "boolean"
        ? input.sentenceTranslationEnabled
        : null,
    updatedAt: readString(input.updatedAt) ?? new Date().toISOString()
  };
}

function parseLearningProfile(input: unknown): CurriculumRuntimeProfileInput {
  if (!isRecord(input)) {
    return {};
  }

  const activeVocabularyBandId = readString(input.activeVocabularyBandId);
  const activePhraseBandId = readString(input.activePhraseBandId);
  const activeGrammarBandId = readString(input.activeGrammarBandId);
  const unlockedBandIds = Array.isArray(input.unlockedBandIds)
    ? input.unlockedBandIds.flatMap((value): string[] => {
        const bandId = readString(value);
        return bandId ? [bandId] : [];
      })
    : undefined;

  return {
    ...(activeVocabularyBandId ? { activeVocabularyBandId } : {}),
    ...(activePhraseBandId ? { activePhraseBandId } : {}),
    ...(activeGrammarBandId ? { activeGrammarBandId } : {}),
    ...(unlockedBandIds ? { unlockedBandIds } : {})
  };
}

function parseCurriculumProgressionDiagnostics(
  input: unknown
): CurriculumProgressionDiagnostics | null {
  if (!isRecord(input)) {
    return null;
  }

  const decidedAt = readString(input.decidedAt);
  const configId = readString(input.configId);
  if (!decidedAt || !configId) {
    return null;
  }

  return {
    decidedAt,
    configId,
    previousBandId: readString(input.previousBandId),
    nextBandId: readString(input.nextBandId),
    eligible: input.eligible === true,
    reason: readString(input.reason) ?? "unknown",
    unmetRequirements: Array.isArray(input.unmetRequirements)
      ? input.unmetRequirements.flatMap((value): string[] => {
          const requirement = readString(value);
          return requirement ? [requirement] : [];
        })
      : [],
    checkpointBoundary: input.checkpointBoundary === true,
    activeVocabularyBandId: readString(input.activeVocabularyBandId),
    activePhraseBandId: readString(input.activePhraseBandId),
    activeGrammarBandId: readString(input.activeGrammarBandId),
    unlockedBandIds: Array.isArray(input.unlockedBandIds)
      ? input.unlockedBandIds.flatMap((value): string[] => {
          const bandId = readString(value);
          return bandId ? [bandId] : [];
        })
      : []
  };
}

async function getUserDataValues(keys: readonly string[]): Promise<StorageRecord> {
  const response = await sendRuntimeMessage<
    { ok: true; values: StorageRecord } | { ok: false; error?: string }
  >({
    type: RuntimeMessageType.GetUserData,
    keys: [...new Set(keys)]
  });

  if (response?.ok && isRecord(response.values)) {
    return response.values;
  }

  return loadIndexedDbUserDataValues(keys);
}

async function setUserDataRuntimeValues(values: StorageRecord): Promise<void> {
  const response = await sendRuntimeMessage<{ ok?: boolean }>({
    type: RuntimeMessageType.SetUserData,
    values
  });
  if (response?.ok) {
    return;
  }

  await setIndexedDbUserDataValues(values);
}

async function removeUserDataRuntimeKeys(keys: readonly string[]): Promise<void> {
  const response = await sendRuntimeMessage<{ ok?: boolean }>({
    type: RuntimeMessageType.RemoveUserData,
    keys: [...new Set(keys)]
  });
  if (response?.ok) {
    return;
  }

  await removeIndexedDbUserDataValues(keys);
}

async function sendRuntimeMessage<TResponse>(message: unknown): Promise<TResponse | null> {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return null;
  }

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }

      resolve((response as TResponse | undefined) ?? null);
    });
  });
}

async function sendTabMessage<TResponse>(
  tabId: number,
  message: unknown
): Promise<TResponse | null> {
  if (typeof chrome === "undefined" || !chrome.tabs?.sendMessage) {
    return null;
  }

  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response: TResponse | undefined) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }

      resolve(response ?? null);
    });
  });
}

function pickFirstDefinedValue(
  values: StorageRecord,
  keys: readonly string[]
): unknown {
  for (const key of keys) {
    if (values[key] !== undefined) {
      return values[key];
    }
  }

  return undefined;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is StorageRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
