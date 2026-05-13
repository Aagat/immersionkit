import { normalizeToken } from "@immersionkit/shared";
import type { RenderUnitEntry, UserVocabEntry } from "@immersionkit/shared";
import type {
  ContextualWordCandidate,
  WordInjectionDecision,
  WordInjectionDecisionResult
} from "../../../../packages/shared/src/validation/word-injection";

import { processTextNode } from "../content/annotate";
import { buildWordRenderIndex } from "../content/word-render-index";

export type BrowserBaselineDecision = WordInjectionDecisionResult & {
  id: string;
  injectedCount: number;
};

const VOCAB_BY_LEXEME_ID = new Map<string, UserVocabEntry>();

export function runContentBaseline(
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

    const renderUnit = buildValidationRenderUnit(candidate);
    const result = processTextNode(textNode, {
      discoveryRate: 1,
      samplingSeed: `validation:${candidate.id}`,
      createNodeId: () => `ik-validation-${nodeSequence++}`,
      wordRenderIndex: buildWordRenderIndex([renderUnit]),
      vocabByLexemeId: VOCAB_BY_LEXEME_ID,
      isKnownWordForScoring: () => true
    });

    host.remove();

    const decision: WordInjectionDecision = result.injectedCount > 0 ? "inject" : "skip";

    return {
      id: candidate.id,
      decision,
      code: result.injectedCount > 0 ? "content-baseline-safe-pos" : "content-baseline-unsafe-pos",
      reason:
        result.injectedCount > 0
          ? "Content-path baseline rendering injected at least one matching token."
          : "Content-path baseline rendering injected zero matching tokens.",
      injectedCount: result.injectedCount
    };
  });
}

function buildValidationRenderUnit(
  candidate: ContextualWordCandidate
): RenderUnitEntry {
  const normalizedSourceText = normalizeToken(candidate.candidateLemma);
  const targetText = candidate.targetLemma;
  const lexemeId = `validation-${candidate.id}`;
  return {
    renderUnitId: `ru:${lexemeId}`,
    lexemeIds: [lexemeId],
    kind: "single-token",
    renderPolicy: "inline",
    sourceText: candidate.candidateLemma,
    normalizedSourceText,
    targetText,
    normalizedTargetText: normalizeToken(targetText),
    sourcePattern: {
      matchMode: "exact",
      tokens: [
        {
          normal: normalizedSourceText,
          lemma: normalizedSourceText,
          pos: candidate.candidatePos
        }
      ]
    },
    replacement: {
      startToken: 0,
      endToken: 1,
      targetText
    },
    pos: candidate.candidatePos,
    minBand: "validation",
    frequencyRank: 1,
    confidence: 0.99,
    provenance: { source: "manual" },
    inflections: [candidate.tokenText.toLowerCase()]
  };
}
