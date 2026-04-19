import { describe, expect, it } from "vitest";

import {
  IMMERSIONKIT_NODE_ATTRIBUTE,
  IMMERSIONKIT_ORIGINAL_TEXT_ATTRIBUTE
} from "../src/content/constants";
import {
  readSentenceNoteMetadata,
  renderSentenceTranslations,
  toggleSentenceSourceReveal
} from "../src/content/sentence-renderer";
import { withFixtureDom } from "./helpers/fixture-dom";

describe("sentence translation rendering", () => {
  it("renders inline translated sentence, exposes popup metadata, and toggles source on reveal", async () => {
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
      expect(note?.textContent).not.toContain("Grammar:");
      expect(note?.querySelector(".ik-sentence-note__source")?.textContent).toBe(
        "The train arrives soon."
      );
      expect(note?.getAttribute("data-ik-source-visible")).toBe("false");

      const metadata = readSentenceNoteMetadata(note);
      expect(metadata?.sentenceHash).toBe(sentenceHash);
      expect(metadata?.sourceText).toBe("The train arrives soon.");
      expect(metadata?.translatedText).toBe("El tren llega pronto.");
      expect(metadata?.grammarNote).toBe(
        "Present tense for a current statement."
      );

      expect(toggleSentenceSourceReveal(note)).toBe(true);
      expect(note?.getAttribute("data-ik-source-visible")).toBe("true");
      expect(note?.textContent).toContain("The train arrives soon.");
    });
  });
});
