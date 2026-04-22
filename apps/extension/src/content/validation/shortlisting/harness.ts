import {
  hashSentence,
  hashString,
  isGoldilocksSentence,
  scoreSentenceByKnownWords
} from "@immersionkit/shared";
import type { SeedLexiconEntry, VocabStatus } from "@immersionkit/shared";

import { DEFAULT_SENTENCE_THRESHOLD } from "../../constants";
import { collectEligibleTextNodes } from "../../dom";
import { buildLexiconLookup } from "../../lexicon";
import { normalizeSentenceWords, segmentText } from "../../tokenize";
import type {
  SentenceObservation,
  SentenceShortlistingAssertion,
  SentenceShortlistingBenchmarkInput,
  SentenceShortlistingBenchmarkResult,
  SentenceShortlistingPolicySummary,
  SentenceShortlistingScenario,
  ShortlistingPolicyId
} from "./types";

const RAW_SENTENCE_PATTERN = /[^.!?]+[.!?]?/g;
const MIN_WORDS_PER_SENTENCE = 5;
const MAX_WORDS_PER_SENTENCE = 32;
const DEFAULT_MAX_SHORTLIST_SIZE = 12;

const POLICY_ORDER: readonly ShortlistingPolicyId[] = [
  "analyze-every-segmented",
  "current-injected-token-gated",
  "injected-token-length-dedupe",
  "phrase-aware-shortlist"
] as const;

const POLICY_LABELS: Readonly<Record<ShortlistingPolicyId, string>> = {
  "analyze-every-segmented": "Analyze Every Segmented Sentence",
  "current-injected-token-gated": "Current Injected-Token-Gated Flow",
  "injected-token-length-dedupe": "Injected Token + Length + Dedupe",
  "phrase-aware-shortlist": "Phrase-Aware Shortlist"
};

type MutablePolicyAccumulator = {
  shortlistedCandidates: number;
  selectedHashes: Set<string>;
  cache: Set<string>;
  cacheHits: number;
  cacheMisses: number;
  falseNegativeSentences: Set<string>;
};

type ScenarioPolicyAccumulator = {
  shortlistedCandidates: number;
  selectedHashes: Set<string>;
  cache: Set<string>;
  cacheHits: number;
  cacheMisses: number;
};

type ScenarioAggregate = {
  scenario: SentenceShortlistingScenario;
  eligibleTextNodes: number;
  segmentedSentences: number;
  segmentedSentencesLengthFiltered: number;
  segmentedSentenceHashes: Set<string>;
  usefulSentenceToHash: Map<string, string>;
  policyAccumulators: Map<ShortlistingPolicyId, ScenarioPolicyAccumulator>;
};

type PassAnalysis = {
  eligibleTextNodes: number;
  rawSentences: SentenceObservation[];
  boundedSentences: SentenceObservation[];
  policyCandidates: Record<ShortlistingPolicyId, SentenceObservation[]>;
};

type SentenceSegmentationOptions = {
  enforceWordBounds: boolean;
  phraseHintsLowercase: readonly string[];
};

export function runSentenceShortlistingBenchmark(
  input: SentenceShortlistingBenchmarkInput
): SentenceShortlistingBenchmarkResult {
  const maxShortlistSize =
    typeof input.maxShortlistSize === "number" && Number.isFinite(input.maxShortlistSize)
      ? Math.max(1, Math.floor(input.maxShortlistSize))
      : DEFAULT_MAX_SHORTLIST_SIZE;

  const lexiconLookup = buildLexiconLookup([...input.lexicon]);
  const vocabByLemmaId = normalizeVocabEntries(input.vocabByLemmaId);
  const phraseHintsLowercase = input.phraseHints
    .map((value) => normalizeWhitespace(value).toLowerCase())
    .filter((value) => value.length > 0);

  const aggregateByPolicy = new Map<ShortlistingPolicyId, MutablePolicyAccumulator>(
    POLICY_ORDER.map((policyId) => [
      policyId,
      {
        shortlistedCandidates: 0,
        selectedHashes: new Set<string>(),
        cache: new Set<string>(),
        cacheHits: 0,
        cacheMisses: 0,
        falseNegativeSentences: new Set<string>()
      }
    ])
  );

  const scenarioAggregates: ScenarioAggregate[] = [];

  for (const scenario of input.scenarios) {
    const scenarioAggregate: ScenarioAggregate = {
      scenario,
      eligibleTextNodes: 0,
      segmentedSentences: 0,
      segmentedSentencesLengthFiltered: 0,
      segmentedSentenceHashes: new Set<string>(),
      usefulSentenceToHash: new Map<string, string>(),
      policyAccumulators: new Map(
        POLICY_ORDER.map((policyId) => [
          policyId,
          {
            shortlistedCandidates: 0,
            selectedHashes: new Set<string>(),
            cache: new Set<string>(),
            cacheHits: 0,
            cacheMisses: 0
          }
        ])
      )
    };

    for (const pass of scenario.passes) {
      const passAnalysis = withScenarioSandbox(input.document, pass.html, (root) => {
        return analyzeScenarioPass({
          root,
          lexiconLookup,
          vocabByLemmaId,
          samplingSeed: `${scenario.urlPath}`,
          discoveryRate: input.discoveryRate,
          goldilocksThreshold: input.goldilocksThreshold,
          maxShortlistSize,
          phraseHintsLowercase
        });
      });

      scenarioAggregate.eligibleTextNodes += passAnalysis.eligibleTextNodes;
      scenarioAggregate.segmentedSentences += passAnalysis.rawSentences.length;
      scenarioAggregate.segmentedSentencesLengthFiltered +=
        passAnalysis.boundedSentences.length;

      for (const sentence of passAnalysis.rawSentences) {
        scenarioAggregate.segmentedSentenceHashes.add(sentence.hash);
      }

      for (const usefulSentence of pass.usefulSentences ?? []) {
        const normalizedUsefulSentence = normalizeWhitespace(usefulSentence);
        if (!normalizedUsefulSentence) {
          continue;
        }

        scenarioAggregate.usefulSentenceToHash.set(
          normalizedUsefulSentence,
          hashSentence(normalizedUsefulSentence)
        );
      }

      for (const policyId of POLICY_ORDER) {
        const policyAccumulator = scenarioAggregate.policyAccumulators.get(policyId);
        if (!policyAccumulator) {
          continue;
        }

        const selectedSentences = passAnalysis.policyCandidates[policyId];
        policyAccumulator.shortlistedCandidates += selectedSentences.length;

        for (const sentence of selectedSentences) {
          policyAccumulator.selectedHashes.add(sentence.hash);

          if (policyAccumulator.cache.has(sentence.hash)) {
            policyAccumulator.cacheHits += 1;
          } else {
            policyAccumulator.cacheMisses += 1;
            policyAccumulator.cache.add(sentence.hash);
          }
        }
      }
    }

    scenarioAggregates.push(scenarioAggregate);

    for (const policyId of POLICY_ORDER) {
      const globalAccumulator = aggregateByPolicy.get(policyId);
      const scenarioAccumulator = scenarioAggregate.policyAccumulators.get(policyId);
      if (!globalAccumulator || !scenarioAccumulator) {
        continue;
      }

      globalAccumulator.shortlistedCandidates += scenarioAccumulator.shortlistedCandidates;
      globalAccumulator.cacheHits += scenarioAccumulator.cacheHits;
      globalAccumulator.cacheMisses += scenarioAccumulator.cacheMisses;

      for (const hash of scenarioAccumulator.selectedHashes) {
        globalAccumulator.selectedHashes.add(hash);

        if (globalAccumulator.cache.has(hash)) {
          // no-op: global summary only needs de-duped set for reporting
        } else {
          globalAccumulator.cache.add(hash);
        }
      }

      const usefulEntries = Array.from(scenarioAggregate.usefulSentenceToHash.entries());
      for (const [sentenceText, usefulHash] of usefulEntries) {
        if (!scenarioAccumulator.selectedHashes.has(usefulHash)) {
          globalAccumulator.falseNegativeSentences.add(sentenceText);
        }
      }
    }
  }

  const baselinePolicy = aggregateByPolicy.get("analyze-every-segmented");
  const baselineEstimatedCalls = baselinePolicy?.cacheMisses ?? 0;

  const scenarioSummaries = scenarioAggregates.map((scenarioAggregate) => {
    const scenarioBaselineCalls =
      scenarioAggregate.policyAccumulators.get("analyze-every-segmented")?.cacheMisses ?? 0;

    const policySummaries = POLICY_ORDER.map((policyId) => {
      const accumulator = scenarioAggregate.policyAccumulators.get(policyId);
      if (!accumulator) {
        return createEmptyPolicySummary(policyId);
      }

      const cacheAttemptCount = accumulator.cacheHits + accumulator.cacheMisses;
      const estimatedAnalysisCallsSaved = Math.max(
        scenarioBaselineCalls - accumulator.cacheMisses,
        0
      );
      const estimatedAnalysisCallsSavedRatio =
        scenarioBaselineCalls <= 0
          ? 0
          : estimatedAnalysisCallsSaved / scenarioBaselineCalls;

      const falseNegatives = Array.from(scenarioAggregate.usefulSentenceToHash.entries())
        .filter(([, usefulHash]) => !accumulator.selectedHashes.has(usefulHash))
        .map(([sentenceText]) => sentenceText)
        .sort((left, right) => left.localeCompare(right));

      return {
        policyId,
        policyLabel: POLICY_LABELS[policyId],
        shortlistedCandidates: accumulator.shortlistedCandidates,
        uniqueSentenceHashes: accumulator.selectedHashes.size,
        estimatedAnalysisCalls: accumulator.cacheMisses,
        estimatedAnalysisCallsSaved,
        estimatedAnalysisCallsSavedRatio,
        cacheHits: accumulator.cacheHits,
        cacheMisses: accumulator.cacheMisses,
        cacheHitRate: cacheAttemptCount <= 0 ? 0 : accumulator.cacheHits / cacheAttemptCount,
        falseNegativeCount: falseNegatives.length,
        falseNegatives
      } satisfies SentenceShortlistingPolicySummary;
    });

    return {
      scenarioId: scenarioAggregate.scenario.id,
      scenarioLabel: scenarioAggregate.scenario.label,
      source: scenarioAggregate.scenario.source,
      eligibleTextNodes: scenarioAggregate.eligibleTextNodes,
      segmentedSentences: scenarioAggregate.segmentedSentences,
      segmentedSentencesLengthFiltered: scenarioAggregate.segmentedSentencesLengthFiltered,
      uniqueSegmentedSentenceHashes: scenarioAggregate.segmentedSentenceHashes.size,
      usefulSentenceCount: scenarioAggregate.usefulSentenceToHash.size,
      policySummaries
    };
  });

  const policySummaries = POLICY_ORDER.map((policyId) => {
    const accumulator = aggregateByPolicy.get(policyId);
    if (!accumulator) {
      return createEmptyPolicySummary(policyId);
    }

    const cacheAttemptCount = accumulator.cacheHits + accumulator.cacheMisses;
    const estimatedAnalysisCallsSaved = Math.max(
      baselineEstimatedCalls - accumulator.cacheMisses,
      0
    );
    const estimatedAnalysisCallsSavedRatio =
      baselineEstimatedCalls <= 0 ? 0 : estimatedAnalysisCallsSaved / baselineEstimatedCalls;

    return {
      policyId,
      policyLabel: POLICY_LABELS[policyId],
      shortlistedCandidates: accumulator.shortlistedCandidates,
      uniqueSentenceHashes: accumulator.selectedHashes.size,
      estimatedAnalysisCalls: accumulator.cacheMisses,
      estimatedAnalysisCallsSaved,
      estimatedAnalysisCallsSavedRatio,
      cacheHits: accumulator.cacheHits,
      cacheMisses: accumulator.cacheMisses,
      cacheHitRate: cacheAttemptCount <= 0 ? 0 : accumulator.cacheHits / cacheAttemptCount,
      falseNegativeCount: accumulator.falseNegativeSentences.size,
      falseNegatives: Array.from(accumulator.falseNegativeSentences).sort((a, b) =>
        a.localeCompare(b)
      )
    } satisfies SentenceShortlistingPolicySummary;
  });

  const assertions = buildBenchmarkAssertions({
    policies: policySummaries,
    scenarios: scenarioSummaries
  });

  return {
    policies: policySummaries,
    scenarios: scenarioSummaries,
    assertions
  };
}

function analyzeScenarioPass(input: {
  root: ParentNode;
  lexiconLookup: ReadonlyMap<string, SeedLexiconEntry>;
  vocabByLemmaId: ReadonlyMap<string, VocabStatus>;
  samplingSeed: string;
  discoveryRate: number;
  goldilocksThreshold: number;
  maxShortlistSize: number;
  phraseHintsLowercase: readonly string[];
}): PassAnalysis {
  const eligibleTextNodes = collectEligibleTextNodes(input.root);
  const rawSentences: SentenceObservation[] = [];
  const boundedSentences: SentenceObservation[] = [];
  const currentCandidates: SentenceObservation[] = [];
  const injectedLengthCandidates: SentenceObservation[] = [];

  for (const node of eligibleTextNodes) {
    const nodeText = node.nodeValue ?? "";
    if (!nodeText.trim()) {
      continue;
    }

    const rawByNode = segmentSentenceObservations(nodeText, {
      enforceWordBounds: false,
      phraseHintsLowercase: input.phraseHintsLowercase
    });
    const boundedByNode = segmentSentenceObservations(nodeText, {
      enforceWordBounds: true,
      phraseHintsLowercase: input.phraseHintsLowercase
    });

    rawSentences.push(...rawByNode);
    boundedSentences.push(...boundedByNode);

    const injectedRawHashes = new Set<string>();
    const injectedBoundedHashes = new Set<string>();

    for (const segment of segmentText(nodeText)) {
      if (segment.kind !== "word") {
        continue;
      }

      const lexiconEntry = input.lexiconLookup.get(segment.normalized);
      if (!lexiconEntry) {
        continue;
      }

      const status = input.vocabByLemmaId.get(lexiconEntry.lemmaId) ?? "new";
      if (status === "ignored") {
        continue;
      }

      const shouldInject =
        status === "known" ||
        shouldInjectDiscoveryToken(
          `${input.samplingSeed}:${segment.normalized}:${segment.start}`,
          input.discoveryRate
        );

      if (!shouldInject) {
        continue;
      }

      const rawSentence = findSentenceForOffset(rawByNode, segment.start);
      if (rawSentence) {
        injectedRawHashes.add(rawSentence.hash);
      }

      const boundedSentence = findSentenceForOffset(boundedByNode, segment.start);
      if (boundedSentence) {
        injectedBoundedHashes.add(boundedSentence.hash);
      }
    }

    const injectedLengthByNode = rawByNode.filter(
      (sentence) =>
        injectedRawHashes.has(sentence.hash) &&
        sentence.wordCount >= MIN_WORDS_PER_SENTENCE &&
        sentence.wordCount <= MAX_WORDS_PER_SENTENCE
    );
    injectedLengthCandidates.push(...injectedLengthByNode);

    const currentByNode = boundedByNode.filter((sentence) => {
      if (!injectedBoundedHashes.has(sentence.hash)) {
        return false;
      }

      const knownWordCount = sentence.words.reduce((count, word) => {
        const lexiconEntry = input.lexiconLookup.get(word);
        if (!lexiconEntry) {
          return count + 1;
        }

        const status = input.vocabByLemmaId.get(lexiconEntry.lemmaId) ?? "new";
        return status === "known" || status === "learning" ? count + 1 : count;
      }, 0);

      const score = scoreSentenceByKnownWords(knownWordCount, sentence.wordCount);
      return isGoldilocksSentence(score, input.goldilocksThreshold);
    });

    currentCandidates.push(...currentByNode);
  }

  const dedupedCurrentCandidates = dedupeByHash(currentCandidates).slice(0, input.maxShortlistSize);
  const dedupedInjectedLengthCandidates = dedupeByHash(injectedLengthCandidates).slice(
    0,
    input.maxShortlistSize
  );
  const phraseAwareCandidates = buildPhraseAwareCandidates({
    boundedSentences,
    injectedLengthCandidates: dedupedInjectedLengthCandidates,
    maxShortlistSize: input.maxShortlistSize
  });

  return {
    eligibleTextNodes: eligibleTextNodes.length,
    rawSentences,
    boundedSentences,
    policyCandidates: {
      "analyze-every-segmented": rawSentences,
      "current-injected-token-gated": dedupedCurrentCandidates,
      "injected-token-length-dedupe": dedupedInjectedLengthCandidates,
      "phrase-aware-shortlist": phraseAwareCandidates
    }
  };
}

function buildPhraseAwareCandidates(input: {
  boundedSentences: readonly SentenceObservation[];
  injectedLengthCandidates: readonly SentenceObservation[];
  maxShortlistSize: number;
}): SentenceObservation[] {
  const seen = new Set<string>();
  const selected: SentenceObservation[] = [];

  for (const sentence of input.injectedLengthCandidates) {
    if (seen.has(sentence.hash)) {
      continue;
    }

    seen.add(sentence.hash);
    selected.push(sentence);

    if (selected.length >= input.maxShortlistSize) {
      return selected;
    }
  }

  for (const sentence of input.boundedSentences) {
    if (!sentence.containsPhraseHint || seen.has(sentence.hash)) {
      continue;
    }

    seen.add(sentence.hash);
    selected.push(sentence);

    if (selected.length >= input.maxShortlistSize) {
      break;
    }
  }

  return selected;
}

function segmentSentenceObservations(
  input: string,
  options: SentenceSegmentationOptions
): SentenceObservation[] {
  const sentences: SentenceObservation[] = [];

  for (const match of input.matchAll(RAW_SENTENCE_PATTERN)) {
    const rawSentence = match[0] ?? "";
    const text = normalizeWhitespace(rawSentence);
    if (!text) {
      continue;
    }

    const words = normalizeSentenceWords(text);
    if (words.length === 0) {
      continue;
    }

    if (
      options.enforceWordBounds &&
      (words.length < MIN_WORDS_PER_SENTENCE || words.length > MAX_WORDS_PER_SENTENCE)
    ) {
      continue;
    }

    const start = match.index ?? 0;
    const end = start + rawSentence.length;
    const lower = text.toLowerCase();
    const containsPhraseHint = options.phraseHintsLowercase.some((phrase) =>
      lower.includes(phrase)
    );

    sentences.push({
      text,
      hash: hashSentence(text),
      wordCount: words.length,
      words,
      start,
      end,
      containsPhraseHint
    });
  }

  return sentences;
}

function findSentenceForOffset(
  sentences: readonly SentenceObservation[],
  offset: number
): SentenceObservation | null {
  for (const sentence of sentences) {
    if (offset >= sentence.start && offset < sentence.end) {
      return sentence;
    }
  }

  return null;
}

function dedupeByHash(sentences: readonly SentenceObservation[]): SentenceObservation[] {
  const seen = new Set<string>();
  const deduped: SentenceObservation[] = [];

  for (const sentence of sentences) {
    if (seen.has(sentence.hash)) {
      continue;
    }

    seen.add(sentence.hash);
    deduped.push(sentence);
  }

  return deduped;
}

function shouldInjectDiscoveryToken(seed: string, discoveryRate: number): boolean {
  if (discoveryRate <= 0) {
    return false;
  }

  if (discoveryRate >= 1) {
    return true;
  }

  const hashPrefix = hashString(seed).slice(0, 8);
  const hashValue = Number.parseInt(hashPrefix, 16);
  return hashValue / 0xffffffff <= discoveryRate;
}

function normalizeVocabEntries(
  input: ReadonlyMap<string, VocabStatus> | Record<string, VocabStatus>
): Map<string, VocabStatus> {
  if (input instanceof Map) {
    return new Map(input);
  }

  return new Map(Object.entries(input));
}

function createEmptyPolicySummary(policyId: ShortlistingPolicyId): SentenceShortlistingPolicySummary {
  return {
    policyId,
    policyLabel: POLICY_LABELS[policyId],
    shortlistedCandidates: 0,
    uniqueSentenceHashes: 0,
    estimatedAnalysisCalls: 0,
    estimatedAnalysisCallsSaved: 0,
    estimatedAnalysisCallsSavedRatio: 0,
    cacheHits: 0,
    cacheMisses: 0,
    cacheHitRate: 0,
    falseNegativeCount: 0,
    falseNegatives: []
  };
}

function buildBenchmarkAssertions(input: {
  policies: readonly SentenceShortlistingPolicySummary[];
  scenarios: readonly {
    scenarioId: string;
    policySummaries: readonly SentenceShortlistingPolicySummary[];
  }[];
}): SentenceShortlistingAssertion[] {
  const policyById = new Map(input.policies.map((policy) => [policy.policyId, policy]));
  const baseline = policyById.get("analyze-every-segmented");
  const current = policyById.get("current-injected-token-gated");
  const injected = policyById.get("injected-token-length-dedupe");
  const phraseAware = policyById.get("phrase-aware-shortlist");

  const assertions: SentenceShortlistingAssertion[] = [];

  assertions.push({
    id: "analysis-calls-reduced-vs-baseline",
    passed:
      (baseline?.estimatedAnalysisCalls ?? 0) >=
      (current?.estimatedAnalysisCalls ?? Number.MAX_SAFE_INTEGER),
    message:
      "Current injected-token-gated flow should not exceed baseline analysis calls."
  });

  assertions.push({
    id: "length-dedupe-reduces-or-matches-current-calls",
    passed:
      (current?.estimatedAnalysisCalls ?? Number.MAX_SAFE_INTEGER) >=
      (injected?.estimatedAnalysisCalls ?? Number.MAX_SAFE_INTEGER),
    message:
      "Injected + length + dedupe should not require more analysis calls than current flow."
  });

  assertions.push({
    id: "phrase-aware-does-not-increase-false-negatives",
    passed:
      (phraseAware?.falseNegativeCount ?? Number.MAX_SAFE_INTEGER) <=
      (injected?.falseNegativeCount ?? Number.MAX_SAFE_INTEGER),
    message:
      "Phrase-aware shortlist should keep or reduce obvious false negatives."
  });

  const rerenderScenario = input.scenarios.find(
    (scenario) => scenario.scenarioId === "dynamic-rerender-same-hash"
  );
  const rerenderCurrent = rerenderScenario?.policySummaries.find(
    (policy) => policy.policyId === "current-injected-token-gated"
  );

  assertions.push({
    id: "rerender-cache-hits-observed",
    passed: (rerenderCurrent?.cacheHits ?? 0) > 0,
    message:
      "Dynamic rerender scenario should show cache hits for repeated sentence hashes."
  });

  return assertions;
}

function withScenarioSandbox<T>(
  document: Document,
  html: string,
  callback: (root: ParentNode) => T
): T {
  if (!document.body) {
    throw new Error("Document body is required for sentence shortlisting benchmark.");
  }

  const sandbox = document.createElement("section");
  sandbox.setAttribute("data-ik-shortlisting-sandbox", "true");

  const parsed = document.implementation.createHTMLDocument("shortlisting-fixture");
  parsed.documentElement.innerHTML = html;

  for (const styleTag of parsed.head.querySelectorAll("style")) {
    const clonedStyle = document.createElement("style");
    clonedStyle.textContent = styleTag.textContent;
    sandbox.append(clonedStyle);
  }

  const contentRoot = document.createElement("div");
  contentRoot.setAttribute("data-ik-shortlisting-content", "true");

  const bodyChildren = Array.from(parsed.body.childNodes);
  for (const child of bodyChildren) {
    contentRoot.append(child.cloneNode(true));
  }

  sandbox.append(contentRoot);
  document.body.append(sandbox);

  try {
    return callback(contentRoot);
  } finally {
    sandbox.remove();
  }
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function readDefaultGoldilocksThreshold(): number {
  return DEFAULT_SENTENCE_THRESHOLD;
}
