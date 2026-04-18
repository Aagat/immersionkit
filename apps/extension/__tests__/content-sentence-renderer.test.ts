import { describe, expect, it } from "vitest";

import {
  IMMERSIONKIT_NODE_ATTRIBUTE,
  IMMERSIONKIT_ORIGINAL_TEXT_ATTRIBUTE
} from "../src/content/constants";
import {
  renderSentenceTranslations,
  toggleSentenceSourceReveal
} from "../src/content/sentence-renderer";
import { withFixtureDom } from "./helpers/fixture-dom";

describe("sentence translation rendering", () => {
  it("renders translated sentence and grammar note, with source reveal toggle", async () => {
    await withFixtureDom("article-basic.html", ({ document }) => {
      const nodeId = "ikn-note-test";
      const sentenceHash = "hash-train-sentence";

      const wrapper = document.createElement("span");
      wrapper.className = "ik-node";
      wrapper.setAttribute(IMMERSIONKIT_NODE_ATTRIBUTE, nodeId);
      wrapper.setAttribute(
        IMMERSIONKIT_ORIGINAL_TEXT_ATTRIBUTE,
        encodeURIComponent("The train arrives soon.")
      );

      const token = document.createElement("span");
      token.className = "ik-word";
      token.textContent = "tren";
      token.setAttribute(IMMERSIONKIT_NODE_ATTRIBUTE, nodeId);
      token.setAttribute("data-ik-sentence-hash", sentenceHash);
      wrapper.append(token);

      document.body.append(wrapper);

      const rendered = renderSentenceTranslations([
        {
          sentenceHash,
          sourceText: "The train arrives soon.",
          translatedText: "El tren llega pronto.",
          grammarNote: "Present tense for a current statement."
        }
      ]);

      expect(rendered).toBe(1);

      const note = document.querySelector<HTMLElement>(
        `[data-ik-sentence-note='true'][data-ik-sentence-hash='${sentenceHash}']`
      );
      expect(note).toBeTruthy();
      expect(note?.textContent).toContain("El tren llega pronto.");
      expect(note?.textContent).toContain(
        "Grammar: Present tense for a current statement."
      );
      expect(note?.querySelector(".ik-sentence-note__source")?.textContent).toContain(
        "Original: The train arrives soon."
      );
      expect(note?.getAttribute("data-ik-source-visible")).toBe("false");

      expect(toggleSentenceSourceReveal(note)).toBe(true);
      expect(note?.getAttribute("data-ik-source-visible")).toBe("true");
    });
  });
});
