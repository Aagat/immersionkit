import {
  DEFAULT_EXTENSION_SETTINGS,
  RuntimeMessageType,
  clampUnitInterval,
  createCurrentFocusSummary,
  createCurriculumPathSummary,
  formatProgressRequirement,
  getActiveCurriculumContent,
  resolveExtensionSettings,
  summarizeCheckpointEligibility,
  type CurriculumBandContent,
  type CurrentFocusSummary,
  type CurriculumPathLevelSummary,
  type CurriculumRuntimeProfileInput,
  type ExtensionSettings,
  type CheckpointEligibilitySummary,
  type LearningItem,
  type ProviderName,
  type ResolvedExtensionSettings,
  type SiteSetting,
  type UserVocabEntry
} from "@immersionkit/shared";
import {
  parseProficiencySeed,
  resolveLearningProfileFromStorage,
  type ProficiencySeed
} from "./proficiency";
import { IndexedDbLearningItemRepository } from "../storage/learning-item-repository";
import {
  IndexedDbUserVocabRepository,
  loadUserDataValues as loadIndexedDbUserDataValues,
  removeUserDataValues as removeIndexedDbUserDataValues,
  setUserDataValues as setIndexedDbUserDataValues
} from "../storage/user-data-repository";
import {
  isRecord,
  pickFirstDefinedValue,
  readString
} from "../storage/serialization";
import { USER_DATA_KEYS } from "../shared/user-data-keys";
import { sendRuntimeMessage, sendTabMessage } from "../runtime-client";
import {
  PAGE_DIAGNOSTICS_MESSAGE_TYPE,
  type PageDiagnosticsSnapshot
} from "../diagnostics/page-diagnostics";
import { DIAGNOSTICS_ENABLED } from "../build-profile";

type StorageRecord = Record<string, unknown>;

const SETTINGS_STORAGE_KEYS = [USER_DATA_KEYS.settings] as const;
const SITE_SETTINGS_STORAGE_KEYS = [USER_DATA_KEYS.siteSettings] as const;
const PROVIDER_API_KEY_STORAGE_KEYS = [
  USER_DATA_KEYS.providerOpenAiApiKey
] as const;
const LEARNING_PROFILE_STORAGE_KEYS = [USER_DATA_KEYS.learningProfile] as const;
const CURRICULUM_PROGRESSION_DIAGNOSTICS_STORAGE_KEYS = [
  USER_DATA_KEYS.curriculumProgressionDiagnostics
] as const;
const FIRST_RUN_INTRO_STORAGE_KEY = USER_DATA_KEYS.firstRunIntro;

export {
  createLearningProfileForBand,
  createLearningProfileForProficiencySeed,
  getExactActiveBandId,
  parseProficiencySeed,
  proficiencySeedToBandId,
  CURRICULUM_BAND_OPTIONS,
  PROFICIENCY_SEED_OPTIONS,
  type ProficiencySeed
} from "./proficiency";

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
  daily: VocabDailyStats[];
};

export type VocabDailyStats = {
  date: string;
  label: string;
  comfortable: number;
  practice: number;
  newCount: number;
  ignored: number;
  total: number;
};

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
  currentFocus: CurrentFocusSummary | null;
  path: CurriculumPathLevelSummary[];
  lastProgressionDecision: CurriculumProgressionDiagnostics | null;
};

export type ActiveCurriculumContentSummary = {
  bandId: string;
  bandLabel: string;
  learnerFocus: CurrentFocusSummary | null;
  vocabularyDomains: readonly string[];
  phraseChunks: readonly string[];
  currentGrammarKeys: readonly string[];
  plannedGrammarKeys: readonly string[];
  sentenceTokenRange: readonly [number, number];
  sentenceClausePolicy: string;
  sentenceTargetPolicy: string;
  sentenceNotes: string;
};

export type LearnerProgressSummary = {
  currentBand: string;
  nextBand: string;
  progressValue: number;
  progressLabel: string;
  description: string;
  checkpointLabel: string;
  blockerLabels: readonly string[];
};

export type GrammarEvidenceStats = {
  featureCount: number;
  assistCount: number;
  qualifiedExposureCount: number;
  dueCount: number;
};

export type ActivePageDiagnostics = {
  tabId: number;
  url: string;
  diagnostics: PageDiagnosticsSnapshot | null;
  message: string;
};

export type CheckpointEligibilityPreview = CheckpointEligibilitySummary;

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
    languagePair: state.settings.languagePair,
    sourceLanguage: state.settings.sourceLanguage,
    targetLanguage: state.settings.targetLanguage,
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

async function saveSiteSettingsMap(siteSettings: SiteSettingsMap): Promise<void> {
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
  const entries = [...(await new IndexedDbUserVocabRepository().loadAll()).values()];

  const stats: VocabStats = {
    total: entries.length,
    newCount: 0,
    learning: 0,
    known: 0,
    ignored: 0,
    daily: createVocabDailyStats(entries)
  };

  for (const entry of entries) {
    if (entry.status === "known") {
      stats.known += 1;
      continue;
    }

    if (entry.status === "learning") {
      stats.learning += 1;
      continue;
    }

    if (entry.status === "ignored") {
      stats.ignored += 1;
      continue;
    }

    stats.newCount += 1;
  }

  return stats;
}

function createVocabDailyStats(
  entries: readonly UserVocabEntry[],
  now: Date = new Date()
): VocabDailyStats[] {
  const days = createRecentDayBuckets(now);
  const byDate = new Map(days.map((day) => [day.date, day] as const));

  for (const entry of entries) {
    const timestamp = entry.lastSeenAt ?? entry.updatedAt ?? entry.createdAt;
    const date = readLocalDateKey(timestamp);
    if (!date) {
      continue;
    }

    const day = byDate.get(date);
    if (!day) {
      continue;
    }

    day.total += 1;
    if (entry.status === "known") {
      day.comfortable += 1;
    } else if (entry.status === "learning") {
      day.practice += 1;
    } else if (entry.status === "ignored") {
      day.ignored += 1;
    } else {
      day.newCount += 1;
    }
  }

  return days;
}

function createRecentDayBuckets(now: Date): VocabDailyStats[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (6 - index));

    return {
      date: formatLocalDateKey(day),
      label: day.toLocaleDateString(undefined, { weekday: "short" }),
      comfortable: 0,
      practice: 0,
      newCount: 0,
      ignored: 0,
      total: 0
    };
  });
}

function readLocalDateKey(timestamp: string | null | undefined): string | null {
  if (!timestamp) {
    return null;
  }

  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  return formatLocalDateKey(date);
}

function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function loadCurriculumDiagnostics(): Promise<CurriculumDiagnostics> {
  const storage = await getUserDataValues([
    ...SETTINGS_STORAGE_KEYS,
    ...LEARNING_PROFILE_STORAGE_KEYS,
    ...CURRICULUM_PROGRESSION_DIAGNOSTICS_STORAGE_KEYS
  ]);
  const rawSettings = pickFirstDefinedValue(storage, SETTINGS_STORAGE_KEYS);
  const profile = resolveLearningProfileFromStorage(
    pickFirstDefinedValue(storage, LEARNING_PROFILE_STORAGE_KEYS),
    isRecord(rawSettings) ? rawSettings.proficiencySeed : undefined
  );

  return createCurriculumDiagnosticsForProfile(
    profile,
    parseCurriculumProgressionDiagnostics(
      pickFirstDefinedValue(storage, CURRICULUM_PROGRESSION_DIAGNOSTICS_STORAGE_KEYS)
    )
  );
}

export async function saveLearningProfile(
  profile: CurriculumRuntimeProfileInput
): Promise<void> {
  await setUserDataRuntimeValues({
    [USER_DATA_KEYS.learningProfile]: profile
  });
}

export function createCurriculumDiagnosticsForProfile(
  profile: CurriculumRuntimeProfileInput,
  lastProgressionDecision: CurriculumProgressionDiagnostics | null = null
): CurriculumDiagnostics {
  return {
    profile,
    activeContent: summarizeActiveCurriculumContent(profile),
    currentFocus: createCurrentFocusSummary({ profile }),
    path: createCurriculumPathSummary({ profile }),
    lastProgressionDecision
  };
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
  const response = await sendRuntimeMessage({
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
  return summarizeCheckpointEligibility(input);
}

export function formatCurriculumProgressRequirement(requirement: string): string {
  return formatProgressRequirement(requirement);
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
    learnerFocus: createCurrentFocusSummary({
      profile: {
        activeVocabularyBandId: bandId,
        activePhraseBandId: bandId,
        activeGrammarBandId: bandId
      }
    }),
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

export async function loadActivePageDiagnostics(): Promise<ActivePageDiagnostics | null> {
  if (!DIAGNOSTICS_ENABLED || typeof chrome === "undefined" || !chrome.tabs?.query) {
    return null;
  }

  const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
    chrome.tabs.query({ currentWindow: true }, (result) => {
      if (chrome.runtime.lastError) {
        resolve([]);
        return;
      }

      resolve(result ?? []);
    });
  });

  const tab = selectDiagnosticsTab(tabs);
  if (!tab?.id || !tab.url) {
    return {
      tabId: 0,
      url: "",
      diagnostics: null,
      message: "Open a supported HTTP(S) page to read active-page diagnostics."
    };
  }

  const diagnostics = await sendPageDiagnosticsMessage(tab.id);
  return {
    tabId: tab.id,
    url: tab.url,
    diagnostics,
    message: diagnostics
      ? "Active-page diagnostics loaded."
      : "No diagnostics response from the selected page."
  };
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
      supportMessage:
        "This tab does not expose a page URL. Open a normal HTTP(S) article, blog, or docs page to use reading mode."
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
      supportMessage:
        "This tab URL could not be read. Open a normal HTTP(S) article, blog, or docs page to use reading mode."
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
      supportMessage:
        "ImmersionKit skips browser, private, and extension pages. Open a normal HTTP(S) article, blog, or docs page to use reading mode."
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

function selectDiagnosticsTab(tabs: readonly chrome.tabs.Tab[]): chrome.tabs.Tab | null {
  const supportedTabs = tabs
    .filter((tab) => isSupportedHttpUrl(tab.url))
    .sort((left, right) => {
      if (left.active !== right.active) {
        return left.active ? -1 : 1;
      }

      return (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0);
    });

  return supportedTabs[0] ?? null;
}

function isSupportedHttpUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function sendPageDiagnosticsMessage(
  tabId: number
): Promise<PageDiagnosticsSnapshot | null> {
  if (!chrome.tabs?.sendMessage) {
    return null;
  }

  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tabId,
      { type: PAGE_DIAGNOSTICS_MESSAGE_TYPE },
      (response?: unknown) => {
        if (chrome.runtime.lastError || !isPageDiagnosticsSnapshot(response)) {
          resolve(null);
          return;
        }

        resolve(response);
      }
    );
  });
}

function isPageDiagnosticsSnapshot(
  value: unknown
): value is PageDiagnosticsSnapshot {
  return (
    isRecord(value) &&
    typeof value.pageUrl === "string" &&
    typeof value.pageHostname === "string" &&
    typeof value.updatedAt === "string"
  );
}

export async function notifySettingsRefresh(tabId?: number | null): Promise<void> {
  await sendRuntimeMessage({ type: RuntimeMessageType.RefreshActiveTab });

  if (typeof tabId !== "number") {
    return;
  }

  await sendTabMessage(tabId, { type: RuntimeMessageType.RefreshActiveTab });
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
  if (!isRecord(input)) {
    return {};
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
  const response = await sendRuntimeMessage({
    type: RuntimeMessageType.GetUserData,
    keys: [...new Set(keys)]
  });

  if (response?.ok && isRecord(response.values)) {
    return response.values;
  }

  return loadIndexedDbUserDataValues(keys);
}

async function setUserDataRuntimeValues(values: StorageRecord): Promise<void> {
  const response = await sendRuntimeMessage({
    type: RuntimeMessageType.SetUserData,
    values
  });
  if (response?.ok) {
    return;
  }

  await setIndexedDbUserDataValues(values);
}

async function removeUserDataRuntimeKeys(keys: readonly string[]): Promise<void> {
  const response = await sendRuntimeMessage({
    type: RuntimeMessageType.RemoveUserData,
    keys: [...new Set(keys)]
  });
  if (response?.ok) {
    return;
  }

  await removeIndexedDbUserDataValues(keys);
}
