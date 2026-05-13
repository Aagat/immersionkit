import {
  DEFAULT_SOURCE_LANGUAGE,
  DEFAULT_TARGET_LANGUAGE,
  hashSentence,
  normalizeToken,
  type AnalyzerOutput,
  type AnalyzerToken,
  type ContextualWordCandidate as RuntimeContextualWordCandidate,
  type PhraseOccurrence,
  type PhraseRegistryEntry,
  type RenderUnitEntry,
  type SentenceAnalysisEntry
} from "@immersionkit/shared";

import renderUnitAsset from "../assets/en-es.render-units.v1.json";
import type { PhraseRegistryRepository } from "../background/phrase-registry";
import {
  SentenceAnalysisService,
  type SentenceAnalysisCandidate
} from "../background/sentence-analysis-service";
import type { SentenceAnalysisCacheRepository } from "../background/sentence-analysis-cache";
import { buildCachedSentenceAnalysisContext } from "../content/runtime-analysis";
import { planTextReplacements } from "../content/replacement-planner";
import { buildWordRenderIndex } from "../content/word-render-index";
import { parseRenderUnitAsset } from "../render-units/render-units";
import { WORD_INJECTION_PRODUCTION_QUALITY_SCENARIOS } from "./word-injection-corpus";

export type ProductionQualityCaseEvaluation = {
  id: string;
  scenarioId: string;
  sentence: string;
  lexemeId: string;
  renderUnitId?: string;
  normalizedText: string;
  expectedDecision: "inject" | "skip";
  actualDecision: "inject" | "skip" | "missing";
  expectedRendered: boolean;
  rendered: boolean;
  expectedTargetText?: string;
  renderedTargetText?: string;
  correctDecision: boolean;
  correctRender: boolean;
  rationale: string;
  actualRationale?: string;
};

export type ProductionQualitySummary = {
  scenarioVersion: string;
  totalScenarios: number;
  totalCases: number;
  expectedInjectCount: number;
  expectedSkipCount: number;
  correctDecisionCount: number;
  decisionAccuracy: number;
  renderedExpectedInjectCount: number;
  renderedExpectedSkipCount: number;
  wrongSenseRenderedCaseIds: string[];
  missedExpectedInjectCaseIds: string[];
  wrongTargetCaseIds: string[];
  perCase: ProductionQualityCaseEvaluation[];
};
export async function runProductionQualityValidation(): Promise<ProductionQualitySummary> {
  const fixture = WORD_INJECTION_PRODUCTION_QUALITY_SCENARIOS;
  const parsedRenderUnitAsset = parseRenderUnitAsset(renderUnitAsset);
  const assetRenderUnits = parsedRenderUnitAsset?.entries ?? [];
  const perCase: ProductionQualityCaseEvaluation[] = [];

  for (const scenario of fixture.scenarios) {
    const renderUnits = [
      ...createProductionQualityRenderUnits(scenario.renderUnits ?? []),
      ...readAssetRenderUnits(assetRenderUnits, scenario.assetRenderUnitIds ?? [])
    ];
    const sentenceHash = hashSentence(scenario.sentence);
    const analyzerOutput = createProductionQualityAnalyzerOutput({
      scenarioId: scenario.id,
      sentence: scenario.sentence,
      sentenceHash,
      tokens: scenario.tokens,
      chunks: scenario.chunks
    });
    const service = new SentenceAnalysisService({
      analyzer: {
        analyzerId: "fixture-annotated",
        analyzerVersion: `contextual-word-injection-production-quality:${fixture.version}`,
        analyze: async () => analyzerOutput
      },
      cache: new InMemorySentenceAnalysisCache(),
      phraseRegistry: new InMemoryPhraseRegistry(),
      learningItems: {
        upsertGrammarFeatureItems: async () => []
      },
      loadRenderUnits: async () => renderUnits,
      loadVocab: async () => new Map()
    });

    const [analysis] = await service.analyzeCandidates([
      {
        sentenceHash,
        sourceText: scenario.sentence
      } satisfies SentenceAnalysisCandidate
    ]);
    if (!analysis) {
      throw new Error(`Production quality scenario ${scenario.id} produced no analysis.`);
    }

    const runtimeAnalysis = buildCachedSentenceAnalysisContext([analysis.entry]);
    const plan = planTextReplacements({
      sourceText: scenario.sentence,
      offsetBase: 0,
      context: {
        discoveryRate: 1,
        sourceLanguage: DEFAULT_SOURCE_LANGUAGE,
        targetLanguage: DEFAULT_TARGET_LANGUAGE,
        samplingSeed: `contextual-word-injection-production-quality:${scenario.id}`,
        nodeId: `contextual-word-injection-quality-${scenario.id}`,
        wordRenderIndex: buildWordRenderIndex(renderUnits),
        vocabByLexemeId: new Map(),
        isKnownWordForScoring: () => true,
        analysisContext: runtimeAnalysis.analysisContext
      }
    });

    for (const expected of scenario.expectedWordDecisions) {
      const candidate = findExpectedContextualWordCandidate(
        analysis.entry,
        expected.lexemeId,
        expected.renderUnitId,
        expected.normalizedText
      );
      const rendered = plan.spans.find(
        (span) =>
          span.kind === "word" &&
          span.wordEntry.lexemeId === expected.lexemeId &&
          (!expected.renderUnitId ||
            span.wordEntry.renderUnitId === expected.renderUnitId) &&
          normalizeToken(span.sourceToken) === normalizeToken(expected.normalizedText)
      );
      const actualDecision = candidate?.decision ?? "missing";
      const renderedTargetText = rendered?.kind === "word" ? rendered.targetToken : undefined;
      const targetMatches =
        !expected.expectedTargetText ||
        normalizeToken(renderedTargetText ?? "") === normalizeToken(expected.expectedTargetText);
      const correctDecision = actualDecision === expected.expectedDecision;
      const correctRender = rendered
        ? expected.expectedRendered && targetMatches
        : !expected.expectedRendered;

      perCase.push({
        id: expected.id,
        scenarioId: scenario.id,
        sentence: scenario.sentence,
        lexemeId: expected.lexemeId,
        renderUnitId: expected.renderUnitId,
        normalizedText: expected.normalizedText,
        expectedDecision: expected.expectedDecision,
        actualDecision,
        expectedRendered: expected.expectedRendered,
        rendered: Boolean(rendered),
        expectedTargetText: expected.expectedTargetText,
        renderedTargetText,
        correctDecision,
        correctRender,
        rationale: expected.rationale,
        actualRationale: candidate?.rationale
      });
    }
  }

  const expectedInjectCount = perCase.filter(
    (entry) => entry.expectedDecision === "inject"
  ).length;
  const expectedSkipCount = perCase.filter(
    (entry) => entry.expectedDecision === "skip"
  ).length;
  const correctDecisionCount = perCase.filter((entry) => entry.correctDecision).length;
  const renderedExpectedInjectCount = perCase.filter(
    (entry) => entry.expectedDecision === "inject" && entry.rendered
  ).length;
  const renderedExpectedSkipCount = perCase.filter(
    (entry) => entry.expectedDecision === "skip" && entry.rendered
  ).length;
  const wrongSenseRenderedCaseIds = perCase
    .filter((entry) => entry.expectedDecision === "skip" && entry.rendered)
    .map((entry) => entry.id);
  const missedExpectedInjectCaseIds = perCase
    .filter((entry) => entry.expectedDecision === "inject" && !entry.rendered)
    .map((entry) => entry.id);
  const wrongTargetCaseIds = perCase
    .filter(
      (entry) =>
        entry.expectedTargetText &&
        entry.rendered &&
        normalizeToken(entry.renderedTargetText ?? "") !==
          normalizeToken(entry.expectedTargetText)
    )
    .map((entry) => entry.id);

  return {
    scenarioVersion: fixture.version,
    totalScenarios: fixture.scenarios.length,
    totalCases: perCase.length,
    expectedInjectCount,
    expectedSkipCount,
    correctDecisionCount,
    decisionAccuracy: safeDivide(correctDecisionCount, perCase.length),
    renderedExpectedInjectCount,
    renderedExpectedSkipCount,
    wrongSenseRenderedCaseIds,
    missedExpectedInjectCaseIds,
    wrongTargetCaseIds,
    perCase
  };
}

function findExpectedContextualWordCandidate(
  entry: SentenceAnalysisEntry,
  lexemeId: string,
  renderUnitId: string | undefined,
  normalizedText: string
): RuntimeContextualWordCandidate | undefined {
  return entry.contextualWordCandidates.find(
    (candidate) =>
      candidate.lexemeId === lexemeId &&
      (!renderUnitId || candidate.renderUnitId === renderUnitId) &&
      normalizeToken(candidate.normalizedText ?? candidate.tokenText) ===
        normalizeToken(normalizedText)
  );
}

function createProductionQualityAnalyzerOutput(input: {
  scenarioId: string;
  sentence: string;
  sentenceHash: string;
  tokens: (typeof WORD_INJECTION_PRODUCTION_QUALITY_SCENARIOS)["scenarios"][number]["tokens"];
  chunks: (typeof WORD_INJECTION_PRODUCTION_QUALITY_SCENARIOS)["scenarios"][number]["chunks"];
}): AnalyzerOutput {
  return {
    analyzerId: "fixture-annotated",
    analyzerVersion: "contextual-word-injection-production-quality",
    sentenceHash: input.sentenceHash,
    sourceText: input.sentence,
    tokens: createAnalyzerTokens(input.sentence, input.tokens, input.scenarioId),
    chunks: input.chunks,
    grammarFeatures: []
  };
}

function createAnalyzerTokens(
  sentence: string,
  specs: (typeof WORD_INJECTION_PRODUCTION_QUALITY_SCENARIOS)["scenarios"][number]["tokens"],
  scenarioId: string
): AnalyzerToken[] {
  let cursor = 0;

  return specs.map(([text, lemma, pos, tags]) => {
    const startOffset = sentence.indexOf(text, cursor);
    if (startOffset < 0) {
      throw new Error(
        `Token ${JSON.stringify(text)} not found in production quality scenario ${scenarioId}.`
      );
    }

    const endOffset = startOffset + text.length;
    cursor = endOffset;
    return {
      text,
      normalized: normalizeToken(text),
      lemma,
      pos,
      tags,
      startOffset,
      endOffset
    };
  });
}

function createProductionQualityRenderUnits(
  specs: NonNullable<
    (typeof WORD_INJECTION_PRODUCTION_QUALITY_SCENARIOS)["scenarios"][number]["renderUnits"]
  >
): RenderUnitEntry[] {
  return specs.map((spec) => {
    const normalizedSourceText = normalizeToken(spec.sourceLemma);
    const normalizedTargetText = normalizeToken(spec.targetLemma);
    return {
      renderUnitId: `ru:contextual-word-injection-quality:${spec.lexemeId}`,
      lexemeIds: [spec.lexemeId],
      kind: "single-token",
      renderPolicy: "inline",
      sourceText: spec.sourceLemma,
      normalizedSourceText,
      targetText: spec.targetLemma,
      normalizedTargetText,
      sourcePattern: {
        matchMode: "exact",
        tokens: [
          {
            normal: normalizedSourceText,
            lemma: normalizedSourceText,
            pos: spec.pos
          }
        ]
      },
      replacement: {
        startToken: 0,
        endToken: 1,
        targetText: spec.targetLemma
      },
      pos: spec.pos,
      minBand: "validation",
      frequencyRank: 1,
      confidence: 0.99,
      provenance: { source: "manual" },
      inflections: [spec.sourceLemma]
    };
  });
}

function readAssetRenderUnits(
  renderUnits: readonly RenderUnitEntry[],
  renderUnitIds: readonly string[]
): RenderUnitEntry[] {
  if (renderUnitIds.length === 0) {
    return [];
  }

  const byId = new Map(renderUnits.map((renderUnit) => [renderUnit.renderUnitId, renderUnit]));
  return renderUnitIds.map((renderUnitId) => {
    const renderUnit = byId.get(renderUnitId);
    if (!renderUnit) {
      throw new Error(`Missing production quality asset render unit ${renderUnitId}.`);
    }

    return renderUnit;
  });
}

class InMemorySentenceAnalysisCache implements SentenceAnalysisCacheRepository {
  private readonly entries = new Map<string, SentenceAnalysisEntry>();

  async get(
    sentenceHash: string,
    analyzerVersion: string
  ): Promise<SentenceAnalysisEntry | null> {
    return this.entries.get(createAnalysisCacheKey(sentenceHash, analyzerVersion)) ?? null;
  }

  async getMany(
    sentenceHashes: readonly string[],
    analyzerVersion: string
  ): Promise<SentenceAnalysisEntry[]> {
    return sentenceHashes.flatMap((sentenceHash) => {
      const entry = this.entries.get(createAnalysisCacheKey(sentenceHash, analyzerVersion));
      return entry ? [entry] : [];
    });
  }

  async put(entry: SentenceAnalysisEntry): Promise<void> {
    this.entries.set(createAnalysisCacheKey(entry.sentenceHash, entry.analyzerVersion), entry);
  }

  async putMany(entries: readonly SentenceAnalysisEntry[]): Promise<void> {
    for (const entry of entries) {
      await this.put(entry);
    }
  }

  async clear(): Promise<void> {
    this.entries.clear();
  }
}

class InMemoryPhraseRegistry implements PhraseRegistryRepository {
  async get(_phraseId: string): Promise<PhraseRegistryEntry | null> {
    return null;
  }

  async upsertOccurrences(
    _occurrences: readonly PhraseOccurrence[],
    _now: string
  ): Promise<PhraseRegistryEntry[]> {
    return [];
  }
}

function createAnalysisCacheKey(sentenceHash: string, analyzerVersion: string): string {
  return `${sentenceHash}:${analyzerVersion}`;
}

function safeDivide(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }

  return numerator / denominator;
}
