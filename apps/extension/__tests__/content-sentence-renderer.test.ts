import { describe, expect, it } from "vitest";
import type { SentenceLearningNote } from "@immersionkit/shared";

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
          learningNote: createLearningNote("Present tense for a current statement.")
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
      expect(metadata?.learningNote.summary).toBe(
        "Present tense for a current statement."
      );

      expect(toggleSentenceSourceReveal(note)).toBe(true);
      expect(note?.getAttribute("data-ik-source-visible")).toBe("true");
      expect(note?.textContent).toContain("The train arrives soon.");
    });
  });

  it("suppresses sentence notes when they are too close together in the same block", async () => {
    await withFixtureDom("article-basic.html", ({ document }) => {
      const paragraph = document.createElement("p");

      const first = createSentenceAnchor({
        document,
        nodeId: "ikn-near-1",
        sentenceHash: "hash-near-1",
        token: "uno"
      });
      const second = createSentenceAnchor({
        document,
        nodeId: "ikn-near-2",
        sentenceHash: "hash-near-2",
        token: "dos"
      });

      paragraph.append(first);
      paragraph.append(" Short bridge text between candidate sentences. ");
      paragraph.append(second);
      document.body.append(paragraph);

      const rendered = renderSentenceTranslations([
        {
          sentenceHash: "hash-near-1",
          sourceText: "First source sentence.",
          translatedText: "Primera frase.",
          learningNote: createLearningNote("Note one.")
        },
        {
          sentenceHash: "hash-near-2",
          sourceText: "Second source sentence.",
          translatedText: "Segunda frase.",
          learningNote: createLearningNote("Note two.")
        }
      ]);

      expect(rendered).toBe(1);
      expect(document.querySelectorAll("[data-ik-sentence-note='true']")).toHaveLength(1);
    });
  });

  it("allows sentence notes that are sufficiently spaced apart", async () => {
    await withFixtureDom("article-basic.html", ({ document }) => {
      const paragraph = document.createElement("p");

      const first = createSentenceAnchor({
        document,
        nodeId: "ikn-far-1",
        sentenceHash: "hash-far-1",
        token: "uno"
      });
      const second = createSentenceAnchor({
        document,
        nodeId: "ikn-far-2",
        sentenceHash: "hash-far-2",
        token: "dos"
      });

      paragraph.append(first);
      paragraph.append(
        " This section intentionally includes a long amount of filler content so the second translated sentence candidate appears much farther away and should still be rendered by the spacing guard in the sentence renderer."
      );
      paragraph.append(second);
      document.body.append(paragraph);

      const rendered = renderSentenceTranslations([
        {
          sentenceHash: "hash-far-1",
          sourceText: "First source sentence.",
          translatedText: "Primera frase.",
          learningNote: createLearningNote("Note one.")
        },
        {
          sentenceHash: "hash-far-2",
          sourceText: "Second source sentence.",
          translatedText: "Segunda frase.",
          learningNote: createLearningNote("Note two.")
        }
      ]);

      expect(rendered).toBe(2);
      expect(document.querySelectorAll("[data-ik-sentence-note='true']")).toHaveLength(2);
    });
  });
});

function createSentenceAnchor(input: {
  document: Document;
  nodeId: string;
  sentenceHash: string;
  token: string;
}): HTMLElement {
  const wrapper = input.document.createElement("span");
  wrapper.className = "ik-node";
  wrapper.setAttribute(IMMERSIONKIT_NODE_ATTRIBUTE, input.nodeId);
  wrapper.setAttribute(
    IMMERSIONKIT_ORIGINAL_TEXT_ATTRIBUTE,
    encodeURIComponent(`${input.token} source text`)
  );

  const token = input.document.createElement("span");
  token.className = "ik-word";
  token.textContent = input.token;
  token.setAttribute(IMMERSIONKIT_NODE_ATTRIBUTE, input.nodeId);
  token.setAttribute("data-ik-sentence-hash", input.sentenceHash);
  wrapper.append(token);

  return wrapper;
}

function createLearningNote(summary: string): SentenceLearningNote {
  return {
    summary,
    literalGloss: "",
    keyPhrase: "",
    canonicalUsage: "",
    grammarFocus: ""
  };
}
