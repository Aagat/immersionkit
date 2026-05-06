import { describe, expect, it } from "vitest";

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
      if (analysis.tokens.length !== patternTokens.length) {
        errors.push(
          `${entry.renderUnitId}: token length ${patternTokens.length} != wink ${analysis.tokens.length}`
        );
        continue;
      }

      patternTokens.forEach((patternToken, index) => {
        const analyzerToken = analysis.tokens[index];
        if (!analyzerToken) {
          return;
        }

        if (patternToken.normal && patternToken.normal !== analyzerToken.normalized) {
          errors.push(
            `${entry.renderUnitId}[${index}].normal ${patternToken.normal} != ${analyzerToken.normalized}`
          );
        }

        const analyzerLemma = analyzerToken.lemma ?? analyzerToken.normalized;
        if (patternToken.lemma && patternToken.lemma !== analyzerLemma) {
          errors.push(
            `${entry.renderUnitId}[${index}].lemma ${patternToken.lemma} != ${analyzerLemma}`
          );
        }

        if (patternToken.pos && patternToken.pos !== analyzerToken.pos) {
          errors.push(
            `${entry.renderUnitId}[${index}].pos ${patternToken.pos} != ${analyzerToken.pos}`
          );
        }
      });
    }

    expect(errors.slice(0, 20)).toEqual([]);
  });
});
