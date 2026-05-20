import type { SentenceLearningNote } from "@immersionkit/shared";
import { describe, expect, it, vi } from "vitest";

import type {
  PhraseActivatedDetail,
  TokenActivatedDetail
} from "../src/content/contracts";
import {
  closePopover,
  mountPopover,
  POPOVER_SPEAK_ACTION_ATTRIBUTE,
  renderPhrasePopover,
  renderSentencePopover,
  renderWordPopover,
  type ContentPopoverRuntimeState
} from "../src/content/popover";
import type { SentenceNoteMetadata } from "../src/content/sentence-renderer";
import { withFixtureDom } from "./helpers/fixture-dom";

describe("content popover placement", () => {
  it.each([
    {
      kind: "word",
      size: { width: 260, height: 190 },
      createPopover: () =>
        renderWordPopover(createWordDetail(), {
          onClose: vi.fn(),
          onStatusAction: vi.fn()
        })
    },
    {
      kind: "phrase",
      size: { width: 260, height: 190 },
      createPopover: () =>
        renderPhrasePopover(createPhraseDetail(), {
          onClose: vi.fn()
        })
    },
    {
      kind: "sentence",
      size: { width: 300, height: 230 },
      createPopover: () => {
        const note = document.createElement("span");
        note.setAttribute("data-ik-source-visible", "false");
        return renderSentencePopover(note, createSentenceDetail(note), {
          onClose: vi.fn(),
          onAction: vi.fn()
        });
      }
    }
  ])(
    "keeps the $kind popover inside a narrow viewport near an edge anchor",
    async ({ createPopover, size }) => {
      await withFixtureDom("article-basic.html", async ({ document, window, wait }) => {
        setViewport(window, 320, 420);

        const anchor = document.createElement("button");
        anchor.textContent = "anchor";
        document.body.append(anchor);
        mockRect(anchor, {
          left: 304,
          top: 388,
          width: 14,
          height: 20
        });

        const popover = createPopover();
        mockRect(popover, {
          left: 0,
          top: 0,
          width: size.width,
          height: size.height
        });

        const runtimeState: ContentPopoverRuntimeState = {
          activeToken: null,
          popover: null,
          popoverCleanup: null
        };
        mountPopover(runtimeState, popover, anchor);

        try {
          expect(runtimeState.popover).toBe(popover);
          expect(popover.getAttribute("data-ik-placement")).toBeTruthy();

          const bounds = readStyledBounds(popover, size);
          expect(bounds.left).toBeGreaterThanOrEqual(10);
          expect(bounds.top).toBeGreaterThanOrEqual(10);
          expect(bounds.right).toBeLessThanOrEqual(310);
          expect(bounds.bottom).toBeLessThanOrEqual(410);
        } finally {
          closePopover(runtimeState);
        }
        await wait(0);
      });
    }
  );
});

describe("content popover speaker controls", () => {
  it("speaks word target text without closing the popover", async () => {
    const onSpeak = vi.fn();
    await withFixtureDom("article-basic.html", async ({ wait }) => {
      const popover = renderWordPopover(createWordDetail(), {
        onClose: vi.fn(),
        onStatusAction: vi.fn(),
        onSpeak
      });

      querySpeakButton(popover).click();
      await wait(0);
      await waitForReactScheduler();

      expect(isLeadingSpeakButton(popover)).toBe(true);
      expect(onSpeak).toHaveBeenCalledWith("ciudad");
      unmountReactPopover(popover);
      await waitForReactScheduler();
    });
  });

  it("speaks phrase target text", async () => {
    const onSpeak = vi.fn();
    await withFixtureDom("article-basic.html", async ({ wait }) => {
      const popover = renderPhrasePopover(createPhraseDetail(), {
        onClose: vi.fn(),
        onSpeak
      });

      querySpeakButton(popover).click();
      await wait(0);
      await waitForReactScheduler();

      expect(isLeadingSpeakButton(popover)).toBe(true);
      expect(onSpeak).toHaveBeenCalledWith("ahora mismo");
      unmountReactPopover(popover);
      await waitForReactScheduler();
    });
  });

  it("speaks sentence translated text", async () => {
    const onSpeak = vi.fn();
    await withFixtureDom("article-basic.html", async ({ document, wait }) => {
      const note = document.createElement("span");
      const popover = renderSentencePopover(note, createSentenceDetail(note), {
        onClose: vi.fn(),
        onAction: vi.fn(),
        onSpeak
      });

      querySpeakButton(popover).click();
      await wait(0);
      await waitForReactScheduler();

      expect(isLeadingSpeakButton(popover)).toBe(true);
      expect(onSpeak).toHaveBeenCalledWith("La ciudad abre temprano.");
      unmountReactPopover(popover);
      await waitForReactScheduler();
    });
  });
});

function setViewport(window: Window, width: number, height: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: height
  });
  Object.defineProperty(window.document.documentElement, "clientWidth", {
    configurable: true,
    value: width
  });
  Object.defineProperty(window.document.documentElement, "clientHeight", {
    configurable: true,
    value: height
  });
}

function mockRect(
  element: HTMLElement,
  rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  }
) {
  const domRect = toDomRect(rect);
  element.getBoundingClientRect = () => domRect;
}

function toDomRect(rect: {
  left: number;
  top: number;
  width: number;
  height: number;
}): DOMRect {
  return {
    ...rect,
    x: rect.left,
    y: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    toJSON: () => ({})
  } as DOMRect;
}

function readStyledBounds(
  popover: HTMLElement,
  size: { width: number; height: number }
): { left: number; top: number; right: number; bottom: number } {
  const left = Number.parseFloat(popover.style.left);
  const top = Number.parseFloat(popover.style.top);
  return {
    left,
    top,
    right: left + size.width,
    bottom: top + size.height
  };
}

function querySpeakButton(popover: HTMLElement): HTMLButtonElement {
  const button = popover.querySelector<HTMLButtonElement>(
    `[${POPOVER_SPEAK_ACTION_ATTRIBUTE}="true"]`
  );
  if (!button) {
    throw new Error("Expected popover speaker button.");
  }

  return button;
}

function isLeadingSpeakButton(popover: HTMLElement): boolean {
  const leadingElement = popover.shadowRoot
    ?.querySelector('[data-slot="card-header"]')
    ?.firstElementChild;
  return leadingElement?.getAttribute(POPOVER_SPEAK_ACTION_ATTRIBUTE) === "true";
}

function unmountReactPopover(popover: HTMLElement): void {
  (popover as HTMLElement & { __ikUnmountReact?: () => void }).__ikUnmountReact?.();
}

function waitForReactScheduler(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function createWordDetail(): TokenActivatedDetail {
  return {
    tokenId: "word-token",
    nodeId: "word-node",
    sourceLanguage: "en",
    targetLanguage: "es",
    sourceToken: "city",
    targetToken: "ciudad",
    sourceLemma: "city",
    lexemeId: "lexeme-city",
    renderUnitId: "ru-city",
    pos: "noun",
    status: "learning",
    wordKind: "discovery",
    sentence: "The city opens early.",
    sentenceHash: "hash-city",
    exampleSentenceEnglish: "The city opens early.",
    exampleSentenceNative: "La ciudad abre temprano.",
    curriculumReason: "Opening this helps ImmersionKit adapt.",
    sourceEvent: "click"
  };
}

function createPhraseDetail(): PhraseActivatedDetail {
  return {
    tokenId: "phrase-token",
    nodeId: "phrase-node",
    sourceLanguage: "en",
    targetLanguage: "es",
    sourceText: "right now",
    targetText: "ahora mismo",
    phraseId: "phrase:fixed:right-now",
    itemId: "phrase:phrase:fixed:right-now",
    category: "fixed-idiom",
    sourceKind: "fixed-phrase",
    ruleId: null,
    confidence: 0.95,
    dueStatus: null,
    schedulerReason: null,
    sentence: "We read the important book right now.",
    sentenceHash: "hash-right-now",
    curriculumReason: "You may see this again when it fits the page.",
    sourceEvent: "click"
  };
}

function createSentenceDetail(note: HTMLElement): SentenceNoteMetadata {
  return {
    note,
    sentenceHash: "hash-sentence",
    sourceText: "The city opens early.",
    translatedText: "La ciudad abre temprano.",
    learningNote: createLearningNote(),
    grammarCards: []
  };
}

function createLearningNote(): SentenceLearningNote {
  return {
    summary: "Present tense for a current statement.",
    literalGloss: "",
    keyPhrase: "",
    canonicalUsage: "",
    grammarFocus: ""
  };
}
