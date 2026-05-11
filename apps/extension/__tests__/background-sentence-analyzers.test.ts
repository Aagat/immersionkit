import { beforeAll, describe, expect, it } from "vitest";

import {
  createWinkNlpSentenceAnalyzer,
  type SentenceAnalyzer
} from "../src/background/sentence-analyzers";

describe("background sentence analyzers", () => {
  let analyzer: SentenceAnalyzer;

  beforeAll(async () => {
    analyzer = await createWinkNlpSentenceAnalyzer();
  });

  it("normalizes wink lemmas and Universal POS tags for contextual word decisions", async () => {
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
    const output = await analyzer.analyze(sentence);

    expect(output.grammarFeatures).toContainEqual(
      expect.objectContaining({ featureKey })
    );
  });

  it("maps will to future grammar without emitting an unknown modal feature", async () => {
    const output = await analyzer.analyze("They will visit the city tomorrow.");
    const featureKeys = output.grammarFeatures.map((feature) => feature.featureKey);

    expect(featureKeys).toContain("future:will");
    expect(featureKeys).not.toContain("modal:will");
  });

  it("does not treat quantity determiners as superlative grammar", async () => {
    const quantityOutput = await analyzer.analyze("Most people waited outside.");
    const leastOutput = await analyzer.analyze("At least one person waited outside.");
    const superlativeOutput = await analyzer.analyze(
      "This is the most important office."
    );
    const terminalSuperlativeOutput = await analyzer.analyze(
      "This team improved the most"
    );

    expect(readFeatureKeys(quantityOutput)).not.toContain("comparison:superlative");
    expect(readFeatureKeys(leastOutput)).not.toContain("comparison:superlative");
    expect(readFeatureKeys(superlativeOutput)).toContain("comparison:superlative");
    expect(readFeatureKeys(terminalSuperlativeOutput)).toContain(
      "comparison:superlative"
    );
  });

  it("gates still and yet concession markers to discourse contexts", async () => {
    const temporalStillOutput = await analyzer.analyze(
      "Customers still depend on it."
    );
    const temporalYetOutput = await analyzer.analyze("They are not yet ready.");
    const discourseStillOutput = await analyzer.analyze(
      "Still, the office stayed open."
    );
    const discourseYetOutput = await analyzer.analyze(
      "Yet, the office stayed open."
    );

    expect(readFeatureKeys(temporalStillOutput)).not.toContain(
      "concession:contrast"
    );
    expect(readFeatureKeys(temporalYetOutput)).not.toContain(
      "concession:contrast"
    );
    expect(readFeatureKeys(discourseStillOutput)).toContain(
      "concession:contrast"
    );
    expect(readFeatureKeys(discourseYetOutput)).toContain("concession:contrast");
  });
});

function readFeatureKeys(output: {
  grammarFeatures: Array<{ featureKey: string }>;
}): string[] {
  return output.grammarFeatures.map((feature) => feature.featureKey);
}
