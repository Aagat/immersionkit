import { describe, expect, it } from "vitest";

import type { AnalyzerToken, RenderUnitTokenPattern } from "@immersionkit/shared";
import bundledLexemeAsset from "../src/assets/en-es.lexemes.v1.json";
import bundledRenderUnitAsset from "../src/assets/en-es.render-units.v1.json";
import { createWinkNlpSentenceAnalyzer } from "../src/background/sentence-analyzers";
import { parseLexemeAsset, parseRenderUnitAsset } from "../src/render-units/render-units";

describe("render-unit wink alignment", () => {
  it("keeps render-unit lexeme references backed by the bundled lexeme asset", () => {
    const renderUnits = parseRenderUnitAsset(bundledRenderUnitAsset);
    const lexemes = parseLexemeAsset(bundledLexemeAsset);
    expect(renderUnits).toBeTruthy();
    expect(lexemes).toBeTruthy();

    const lexemeIds = new Set(lexemes?.entries.map((entry) => entry.lexemeId) ?? []);
    const missing = new Set<string>();
    for (const entry of renderUnits?.entries ?? []) {
      for (const lexemeId of entry.lexemeIds) {
        if (!lexemeIds.has(lexemeId)) {
          missing.add(lexemeId);
        }
      }
    }

    expect([...missing].sort()).toEqual([]);
  });

  it("keeps analyzer-consumed source patterns aligned with background wink tokens", async () => {
    const parsed = parseRenderUnitAsset(bundledRenderUnitAsset);
    expect(parsed).toBeTruthy();
    const analyzer = await createWinkNlpSentenceAnalyzer();
    const errors: string[] = [];

    for (const entry of parsed?.entries ?? []) {
      if (
        entry.sourceText.includes("{") ||
        (entry.kind === "single-token" && entry.sourceText.includes("-"))
      ) {
        continue;
      }

      const patternTokens = entry.sourcePattern.tokens.filter(
        (token) => !token.optional
      );
      const analysis = await analyzer.analyze(entry.sourceText);
      let alignmentErrors = collectAlignmentErrors(
        entry.renderUnitId,
        patternTokens,
        analysis.tokens
      );

      if (
        alignmentErrors.length > 0 &&
        hasFeatureConstrainedTokens(patternTokens) &&
        entry.exampleSentenceEnglish
      ) {
        const exampleAnalysis = await analyzer.analyze(entry.exampleSentenceEnglish);
        const exampleWindow = findMatchingPatternWindow(
          exampleAnalysis.tokens,
          patternTokens
        );
        if (exampleWindow) {
          alignmentErrors = [];
        }
      }

      errors.push(...alignmentErrors);
    }

    expect(errors.slice(0, 20)).toEqual([]);
  });
});

function collectAlignmentErrors(
  renderUnitId: string,
  patternTokens: readonly RenderUnitTokenPattern[],
  analyzerTokens: readonly AnalyzerToken[]
): string[] {
  if (analyzerTokens.length !== patternTokens.length) {
    return [
      `${renderUnitId}: token length ${patternTokens.length} != wink ${analyzerTokens.length}`
    ];
  }

  return patternTokens.flatMap((patternToken, index) => {
    const analyzerToken = analyzerTokens[index];
    if (!analyzerToken) {
      return [];
    }

    return collectTokenErrors(renderUnitId, index, patternToken, analyzerToken);
  });
}

function collectTokenErrors(
  renderUnitId: string,
  index: number,
  patternToken: RenderUnitTokenPattern,
  analyzerToken: AnalyzerToken
): string[] {
  const errors: string[] = [];

  if (patternToken.normal && patternToken.normal !== analyzerToken.normalized) {
    errors.push(
      `${renderUnitId}[${index}].normal ${patternToken.normal} != ${analyzerToken.normalized}`
    );
  }

  const analyzerLemma = analyzerToken.lemma ?? analyzerToken.normalized;
  if (patternToken.lemma && patternToken.lemma !== analyzerLemma) {
    errors.push(
      `${renderUnitId}[${index}].lemma ${patternToken.lemma} != ${analyzerLemma}`
    );
  }

  if (patternToken.pos && patternToken.pos !== analyzerToken.pos) {
    errors.push(
      `${renderUnitId}[${index}].pos ${patternToken.pos} != ${analyzerToken.pos}`
    );
  }

  return errors;
}

function hasFeatureConstrainedTokens(
  patternTokens: readonly RenderUnitTokenPattern[]
): boolean {
  return patternTokens.some((token) => Boolean(token.features));
}

function findMatchingPatternWindow(
  analyzerTokens: readonly AnalyzerToken[],
  patternTokens: readonly RenderUnitTokenPattern[]
): readonly AnalyzerToken[] | null {
  for (let start = 0; start <= analyzerTokens.length - patternTokens.length; start += 1) {
    const window = analyzerTokens.slice(start, start + patternTokens.length);
    if (
      window.every((analyzerToken, index) =>
        matchesPatternToken(patternTokens[index], analyzerToken)
      )
    ) {
      return window;
    }
  }

  return null;
}

function matchesPatternToken(
  patternToken: RenderUnitTokenPattern,
  analyzerToken: AnalyzerToken
): boolean {
  const analyzerLemma = analyzerToken.lemma ?? analyzerToken.normalized;
  return (
    (!patternToken.normal || patternToken.normal === analyzerToken.normalized) &&
    (!patternToken.lemma || patternToken.lemma === analyzerLemma) &&
    (!patternToken.pos || patternToken.pos === analyzerToken.pos)
  );
}
