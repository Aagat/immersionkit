import { describe, expect, it } from "vitest";
import {
  BEGINNER_DIFFICULTY_PRESET,
  INTERMEDIATE_DIFFICULTY_PRESET
} from "../src/scoring/difficulty";
import {
  compareSuitabilityScorers,
  type SuitabilityCorpus
} from "../src/validation/suitability";
import corpusFixture from "../../fixtures/evals/sentence-suitability/sentence-suitability-corpus.json";

const corpus = corpusFixture as SuitabilityCorpus;

describe("sentence suitability corpus", () => {
  it("contains both beginner and intermediate profiles", () => {
    const profileIds = corpus.profiles.map((profile) => profile.id);
    expect(profileIds).toContain("beginner_a2");
    expect(profileIds).toContain("intermediate_b1");
  });

  it("covers all required category buckets", () => {
    const categories = new Set(corpus.sentences.map((sentence) => sentence.category));

    expect(categories).toEqual(
      new Set([
        "clearly_beginner_friendly",
        "borderline",
        "vocab_easy_structurally_awkward",
        "due_target_high_complexity",
        "reusable_phrase_value",
        "ambiguity_or_chunking_penalty"
      ])
    );
  });

  it("provides labels for every profile on every sentence", () => {
    for (const profile of corpus.profiles) {
      for (const sentence of corpus.sentences) {
        expect(sentence.profiles[profile.id]).toBeDefined();
      }
    }
  });
});

describe("sentence suitability ranking", () => {
  it("beats known-ratio baseline for both target profiles", () => {
    const results = compareSuitabilityScorers(corpus, {
      [BEGINNER_DIFFICULTY_PRESET.id]: BEGINNER_DIFFICULTY_PRESET,
      [INTERMEDIATE_DIFFICULTY_PRESET.id]: INTERMEDIATE_DIFFICULTY_PRESET
    });

    const beginner = results.find((result) => result.profileId === "beginner_a2");
    const intermediate = results.find(
      (result) => result.profileId === "intermediate_b1"
    );

    expect(beginner).toBeDefined();
    expect(intermediate).toBeDefined();

    expect(beginner!.deltas.pairwiseAccuracy).toBeGreaterThanOrEqual(0.08);
    expect(beginner!.deltas.ndcgAt5).toBeGreaterThanOrEqual(0.05);

    expect(intermediate!.deltas.pairwiseAccuracy).toBeGreaterThanOrEqual(0.06);
    expect(intermediate!.deltas.ndcgAt5).toBeGreaterThanOrEqual(0.04);
  });

  it("demotes awkward high-known-ratio sentences for beginner ranking", () => {
    const [beginner] = compareSuitabilityScorers(corpus, {
      [BEGINNER_DIFFICULTY_PRESET.id]: BEGINNER_DIFFICULTY_PRESET
    }).filter((result) => result.profileId === "beginner_a2");

    const awkwardIds = new Set(["s09_nested_city_team", "s10_person_called_yesterday"]);
    const topFivePrototype = beginner.prototypeOrder.slice(0, 5);

    expect(topFivePrototype.some((id) => awkwardIds.has(id))).toBe(false);
  });
});
