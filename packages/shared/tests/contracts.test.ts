import { describe, expect, it } from "vitest";

import { RuntimeMessageType, STORAGE_NAMESPACES } from "../src";

describe("runtime contracts", () => {
  it("keeps runtime message types stable and namespaced", () => {
    expect(RuntimeMessageType.Ping).toBe("runtime/ping");
    expect(RuntimeMessageType.RefreshActiveTab).toBe("settings/refresh-active-tab");
    expect(RuntimeMessageType.QueueSentenceCandidates).toBe(
      "sentence/queue-candidates"
    );
    expect(RuntimeMessageType.SentenceTranslationResult).toBe(
      "sentence/translation-result"
    );
  });

  it("keeps runtime message types unique", () => {
    const values = Object.values(RuntimeMessageType);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("storage namespace contracts", () => {
  it("keeps deterministic storage namespace ordering", () => {
    expect(STORAGE_NAMESPACES).toEqual([
      "seed-lexicon",
      "vocab",
      "sentence-cache",
      "site-settings",
      "extension-settings"
    ]);
  });

  it("keeps storage namespaces unique", () => {
    expect(new Set(STORAGE_NAMESPACES).size).toBe(STORAGE_NAMESPACES.length);
  });
});
