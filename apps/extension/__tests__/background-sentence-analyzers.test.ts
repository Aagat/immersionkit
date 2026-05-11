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

  it.each([
    ["There is a quiet city nearby.", "existential:there-is"],
    ["She is not ready today.", "negation:basic-not"],
    ["No visitors came today.", "negation:basic-no"],
    ["They do not visit every day.", "negation:do-not"],
    ["Where is the city office?", "question:basic-wh"],
    ["She usually visits the office.", "present:routine-verbs"],
    ["They will visit the city tomorrow.", "future:will"],
    ["The team arrives tomorrow.", "time:anchor-basic"],
    ["Before lunch, the team visits the office.", "time:sequence-basic"],
    ["The city is bigger than the town.", "comparison:comparative"],
    ["This is the biggest office.", "comparison:superlative"],
    ["Several visitors waited outside.", "determiner:quantity-basic"],
    ["Then the team visits the city.", "connector:sequence"],
    ["If possible, we visit today.", "conditional:if-basic"],
    ["Although it rained, we visited.", "contrast:although"],
    ["However, the office stayed open.", "concession:contrast"],
    ["To some extent, the plan worked.", "discourse:stance-marker"]
  ])("detects %s as %s", async (sentence, featureKey) => {
    const analyzer = await createWinkNlpSentenceAnalyzer();
    const output = await analyzer.analyze(sentence);

    expect(output.grammarFeatures).toContainEqual(
      expect.objectContaining({ featureKey })
    );
  });

  it("maps will to future grammar without emitting an unknown modal feature", async () => {
    const analyzer = await createWinkNlpSentenceAnalyzer();
    const output = await analyzer.analyze("They will visit the city tomorrow.");
    const featureKeys = output.grammarFeatures.map((feature) => feature.featureKey);

    expect(featureKeys).toContain("future:will");
    expect(featureKeys).not.toContain("modal:will");
  });
});
