import { describe, expect, it } from "vitest";

import { createWinkNlpSentenceAnalyzer } from "../src/background/sentence-analyzers";

describe("background sentence analyzers", () => {
  it("normalizes wink lemmas and Universal POS tags for contextual word decisions", async () => {
    const analyzer = await createWinkNlpSentenceAnalyzer();
    const output = await analyzer.analyze(
      "You might not need to write specs. This creates zero friction. ACIDs rely on stable numbering. The boundary is up to you."
    );
    const byText = new Map(output.tokens.map((token) => [token.text, token]));

    expect(byText.get("might")).toMatchObject({
      lemma: "might",
      pos: "modal"
    });
    expect(byText.get("need")).toMatchObject({
      lemma: "need",
      pos: "verb"
    });
    expect(byText.get("This")).toMatchObject({
      lemma: "this",
      pos: "pronoun"
    });
    expect(byText.get("creates")).toMatchObject({
      lemma: "create",
      pos: "verb"
    });
    expect(byText.get("zero")).toMatchObject({
      lemma: "zero",
      pos: "number"
    });
    expect(byText.get("on")).toMatchObject({
      lemma: "on",
      pos: "preposition"
    });
    expect(byText.get("up")).toMatchObject({
      lemma: "up",
      pos: "preposition"
    });
  });
});
