import type { SeedLexiconEntry, UserVocabEntry } from "@immersionkit/shared";
import type {
  ContextualWordCandidate,
  WordInjectionDecision,
  WordInjectionDecisionResult
} from "../../../../packages/shared/src/validation/word-injection";

import { processTextNode } from "../content/annotate";
import { buildLexiconLookup } from "../content/lexicon";

export type BrowserBaselineDecision = WordInjectionDecisionResult & {
  id: string;
  injectedCount: number;
};

const VOCAB_BY_LEMMA_ID = new Map<string, UserVocabEntry>();

export function runLemmaOnlyContentBaseline(
  candidates: ContextualWordCandidate[]
): BrowserBaselineDecision[] {
  let nodeSequence = 0;

  return candidates.map((candidate) => {
    const host = document.createElement("p");
    host.setAttribute("data-ik-validation-case", candidate.id);
    host.style.display = "none";

    const textNode = document.createTextNode(candidate.sentence);
    host.append(textNode);
    document.body.append(host);

    const lexiconEntry = buildValidationLexiconEntry(candidate);
    const result = processTextNode(textNode, {
      discoveryRate: 1,
      samplingSeed: `validation:${candidate.id}`,
      createNodeId: () => `ik-validation-${nodeSequence++}`,
      lexiconLookup: buildLexiconLookup([lexiconEntry]),
      vocabByLemmaId: VOCAB_BY_LEMMA_ID,
      isKnownWordForScoring: () => true
    });

    host.remove();

    const decision: WordInjectionDecision = result.injectedCount > 0 ? "inject" : "skip";

    return {
      id: candidate.id,
      decision,
      code: result.injectedCount > 0 ? "lemma-only-safe-pos" : "lemma-only-unsafe-pos",
      reason:
        result.injectedCount > 0
          ? "Content-path lemma-only processing injected at least one matching token."
          : "Content-path lemma-only processing injected zero matching tokens.",
      injectedCount: result.injectedCount
    };
  });
}

function buildValidationLexiconEntry(
  candidate: ContextualWordCandidate
): SeedLexiconEntry {
  return {
    lemmaId: `validation-${candidate.id}`,
    sourceLemma: candidate.candidateLemma,
    targetLemma: candidate.targetLemma,
    pos: candidate.candidatePos,
    frequencyRank: 1,
    confidence: 0.99,
    inflections: [candidate.tokenText.toLowerCase()]
  };
}
