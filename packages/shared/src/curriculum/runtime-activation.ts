import type {
  LearningItem,
  PhraseCategory,
  PhraseSourceKind,
  VocabStatus
} from "../domain/models";
import type { WordRenderEntry } from "../replacement/render-units";
import { beginnerCognateDiscoveryRateFloor } from "../text/cognates";
import {
  evaluatePhraseCurriculumContentInventory,
  evaluateWordCurriculumContentInventory,
  getActiveCurriculumContent,
  type ActiveCurriculumContent
} from "./content";
import {
  evaluateCurriculumEligibility,
  type CurriculumConfig,
  type CurriculumRuntimeProfileInput
} from "./config";

export type RuntimeActivationDecision = {
  eligible: boolean;
  configId?: string;
  activeBandId?: string | null;
  discoveryRateFloor?: number | null;
  activationReason?: string | null;
  skipReason?: string | null;
};

export type WordRuntimeActivationInput = {
  config: Partial<CurriculumConfig> | null | undefined;
  profile?: CurriculumRuntimeProfileInput | null;
  activeContent?: ActiveCurriculumContent;
  wordEntry: WordRenderEntry;
  learningItem: LearningItem | null;
  status: VocabStatus;
  isDueForReview: boolean;
};

export type PhraseRuntimeActivationInput = {
  config: Partial<CurriculumConfig> | null | undefined;
  profile?: CurriculumRuntimeProfileInput | null;
  activeContent?: ActiveCurriculumContent;
  phraseId: string;
  sourceText: string;
  learningItem: LearningItem;
  sourceKind: PhraseSourceKind;
  category: PhraseCategory;
  renderUnitMinBand?: string;
  isDueForReview: boolean;
};

export function evaluateWordRuntimeActivation(
  input: WordRuntimeActivationInput
): RuntimeActivationDecision {
  const activeContent =
    input.activeContent ??
    getActiveCurriculumContent({
      config: input.config,
      profile: input.profile,
      unitType: "word"
    });

  if (input.wordEntry.renderUnitMinBand) {
    const renderUnitBandDecision = evaluateWordCurriculumContentInventory({
      wordEntry: input.wordEntry,
      activeContent
    });
    if (!renderUnitBandDecision.eligible) {
      return {
        eligible: false,
        activeBandId: renderUnitBandDecision.activeBandId,
        skipReason: renderUnitBandDecision.skipReason
      };
    }
  }

  if (input.isDueForReview || input.status !== "new") {
    return { eligible: true };
  }

  const decision = evaluateCurriculumEligibility(input.config, {
    unitType: "word",
    itemId: input.wordEntry.lexemeId,
    bandId: input.learningItem?.bandId ?? null,
    score: scoreWordRenderDifficulty(input.wordEntry),
    profile: input.profile
  });
  if (!decision.eligible) {
    return decision;
  }

  const inventoryDecision = evaluateWordCurriculumContentInventory({
    wordEntry: input.wordEntry,
    activeContent
  });
  if (!inventoryDecision.eligible) {
    return {
      eligible: false,
      configId: decision.configId,
      activeBandId: inventoryDecision.activeBandId,
      skipReason: inventoryDecision.skipReason
    };
  }

  const cognateDiscoveryRateFloor = beginnerCognateDiscoveryRateFloor(
    input.wordEntry,
    inventoryDecision.activeBandId
  );

  return {
    ...decision,
    discoveryRateFloor: cognateDiscoveryRateFloor,
    activationReason:
      inventoryDecision.matchReason === "beginner-cognate" ||
      cognateDiscoveryRateFloor !== null
        ? "beginner-cognate"
        : null
  };
}

export function evaluatePhraseRuntimeActivation(
  input: PhraseRuntimeActivationInput
): RuntimeActivationDecision {
  const activeContent =
    input.activeContent ??
    getActiveCurriculumContent({
      config: input.config,
      profile: input.profile,
      unitType: "phrase"
    });

  if (input.renderUnitMinBand) {
    const renderUnitBandDecision = evaluatePhraseCurriculumContentInventory({
      sourceText: input.sourceText,
      sourceKind: input.sourceKind,
      category: input.category,
      renderUnitMinBand: input.renderUnitMinBand,
      activeContent
    });
    if (!renderUnitBandDecision.eligible) {
      return {
        eligible: false,
        activeBandId: renderUnitBandDecision.activeBandId,
        skipReason: renderUnitBandDecision.skipReason
      };
    }
  }

  if (input.isDueForReview) {
    return { eligible: true };
  }

  const decision = evaluateCurriculumEligibility(input.config, {
    unitType: "phrase",
    itemId: input.phraseId,
    bandId: input.learningItem.bandId ?? null,
    profile: input.profile
  });
  if (!decision.eligible) {
    return decision;
  }

  const inventoryDecision = evaluatePhraseCurriculumContentInventory({
    sourceText: input.sourceText,
    sourceKind: input.sourceKind,
    category: input.category,
    renderUnitMinBand: input.renderUnitMinBand,
    activeContent
  });
  if (!inventoryDecision.eligible) {
    return {
      eligible: false,
      configId: decision.configId,
      activeBandId: inventoryDecision.activeBandId,
      skipReason: inventoryDecision.skipReason
    };
  }

  return decision;
}

function scoreWordRenderDifficulty(entry: WordRenderEntry): number | null {
  if (typeof entry.frequencyRank !== "number" || !Number.isFinite(entry.frequencyRank)) {
    return null;
  }

  return Math.max(0, Math.min(1, entry.frequencyRank / 5000));
}
