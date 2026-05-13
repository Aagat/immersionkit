import type {
  SentenceGrammarCard,
  SentenceLearningNote,
  SentenceTranslationResult
} from "@immersionkit/shared";
import {
  createSentenceLearningNote,
  hasSentenceLearningNoteContent
} from "@immersionkit/shared";

import {
  IMMERSIONKIT_NODE_ATTRIBUTE,
  IMMERSIONKIT_ORIGINAL_TEXT_ATTRIBUTE
} from "./constants";
import type {
  RegisteredSentenceAnchor,
  SentenceAnchorRegistry
} from "./sentence-anchor-registry";

const SENTENCE_NOTE_SELECTOR = "[data-ik-sentence-note='true']";
const SENTENCE_SOURCE_TEXT_ATTRIBUTE = "data-ik-sentence-source-text";
const SENTENCE_TRANSLATED_TEXT_ATTRIBUTE = "data-ik-sentence-translated-text";
const SENTENCE_LEARNING_NOTE_ATTRIBUTE = "data-ik-sentence-learning-note";
const SENTENCE_GRAMMAR_CARDS_ATTRIBUTE = "data-ik-sentence-grammar-cards";
const SENTENCE_KIND_ATTRIBUTE = "data-ik-sentence-kind";
const MIN_SENTENCE_NOTE_CHAR_GAP = 180;

export type SentenceNoteMetadata = {
  note: HTMLElement;
  sentenceHash: string;
  sourceText: string;
  translatedText: string;
  learningNote: SentenceLearningNote;
  grammarCards: SentenceGrammarCard[];
};

export function parseSentenceTranslationResults(
  input: unknown
): SentenceTranslationResult[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const parsed: SentenceTranslationResult[] = [];

  for (const value of input) {
    const result = normalizeSentenceTranslationResult(value);
    if (result) {
      parsed.push(result);
    }
  }

  return parsed;
}

export function renderSentenceTranslations(
  results: readonly SentenceTranslationResult[],
  anchorRegistry?: SentenceAnchorRegistry
): number {
  if (results.length === 0) {
    return 0;
  }

  const dedupedResults = dedupeBySentenceHash(results);
  const spacingGuard = createSentenceSpacingGuard(MIN_SENTENCE_NOTE_CHAR_GAP);
  let renderedCount = 0;

  for (const result of dedupedResults) {
    const anchors = collectSentenceAnchors(result.sentenceHash, anchorRegistry);

    for (const anchor of anchors) {
      const existingNote = findSentenceNote(anchor.nodeId, result.sentenceHash);
      if (existingNote) {
        updateSentenceNote(existingNote, result, anchor.sentenceKind);
        renderedCount += 1;
        continue;
      }

      if (!spacingGuard.canPlace(anchor.node)) {
        continue;
      }

      const note = createSentenceNote(result, anchor.nodeId, anchor.sentenceKind);
      anchor.node.after(note);
      renderedCount += 1;
    }
  }

  return renderedCount;
}

export function toggleSentenceSourceReveal(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  const note = target.closest<HTMLElement>(SENTENCE_NOTE_SELECTOR);
  if (!note) {
    return false;
  }

  const nextVisible = note.getAttribute("data-ik-source-visible") !== "true";
  note.setAttribute("data-ik-source-visible", String(nextVisible));
  return true;
}

export function readSentenceNoteMetadata(
  target: EventTarget | null
): SentenceNoteMetadata | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const note = target.closest<HTMLElement>(SENTENCE_NOTE_SELECTOR);
  if (!note) {
    return null;
  }

  const sentenceHash = readNonEmptyString(note.getAttribute("data-ik-sentence-hash"));
  const sourceText = readNonEmptyString(note.getAttribute(SENTENCE_SOURCE_TEXT_ATTRIBUTE));
  const translatedText = readNonEmptyString(
    note.getAttribute(SENTENCE_TRANSLATED_TEXT_ATTRIBUTE)
  );
  const learningNote = readSentenceLearningNote(note);
  const grammarCards = readSentenceGrammarCards(note);

  if (!sentenceHash || !sourceText || !translatedText || !learningNote) {
    return null;
  }

  return {
    note,
    sentenceHash,
    sourceText,
    translatedText,
    learningNote,
    grammarCards
  };
}

export function clearSentenceTranslations(root: ParentNode = document): number {
  const queryRoot = isQueryRoot(root) ? root : document;
  const notes = queryRoot.querySelectorAll<HTMLElement>(SENTENCE_NOTE_SELECTOR);

  for (const note of notes) {
    note.remove();
  }

  return notes.length;
}

function collectSentenceAnchors(
  sentenceHash: string,
  anchorRegistry?: SentenceAnchorRegistry
): {
  nodeId: string;
  node: ChildNode;
  sentenceKind: "known" | "unknown";
}[] {
  const escapedHash = escapeSelectorValue(sentenceHash);
  const tokenMatches = document.querySelectorAll<HTMLElement>(
    `[data-ik-sentence-hash="${escapedHash}"][${IMMERSIONKIT_NODE_ATTRIBUTE}]`
  );

  const anchors = new Map<
    string,
    {
      wrapper: HTMLElement;
      hasUnknownToken: boolean;
    }
  >();
  for (const match of tokenMatches) {
    const nodeId = match.getAttribute(IMMERSIONKIT_NODE_ATTRIBUTE);
    if (!nodeId) {
      continue;
    }

    let entry = anchors.get(nodeId);
    if (!entry) {
      const escapedNodeId = escapeSelectorValue(nodeId);
      const wrapper = document.querySelector<HTMLElement>(
        `[${IMMERSIONKIT_NODE_ATTRIBUTE}="${escapedNodeId}"][${IMMERSIONKIT_ORIGINAL_TEXT_ATTRIBUTE}]`
      );

      if (!wrapper) {
        continue;
      }

      entry = {
        wrapper,
        hasUnknownToken: false
      };
      anchors.set(nodeId, entry);
    }

    if (match.getAttribute("data-ik-word-kind") !== "known") {
      entry.hasUnknownToken = true;
    }
  }

  const domAnchors: RegisteredSentenceAnchor[] = [...anchors.entries()].map(
    ([nodeId, entry]) => ({
      nodeId,
      node: entry.wrapper,
      sentenceKind: entry.hasUnknownToken ? "unknown" : "known"
    })
  );
  const existingNodeIds = new Set(domAnchors.map((anchor) => anchor.nodeId));
  const registeredAnchors = (anchorRegistry?.collect(sentenceHash) ?? []).filter(
    (anchor): anchor is RegisteredSentenceAnchor => !existingNodeIds.has(anchor.nodeId)
  );

  return [...domAnchors, ...registeredAnchors];
}

function findSentenceNote(
  nodeId: string,
  sentenceHash: string
): HTMLElement | null {
  const escapedNodeId = escapeSelectorValue(nodeId);
  const escapedHash = escapeSelectorValue(sentenceHash);

  return document.querySelector<HTMLElement>(
    `${SENTENCE_NOTE_SELECTOR}[${IMMERSIONKIT_NODE_ATTRIBUTE}="${escapedNodeId}"][data-ik-sentence-hash="${escapedHash}"]`
  );
}

function createSentenceNote(
  result: SentenceTranslationResult,
  nodeId: string,
  sentenceKind: "known" | "unknown"
): HTMLElement {
  const note = document.createElement("span");

  note.className = "ik-ui-mark ik-ui-mark--sentence ik-sentence-note";
  note.tabIndex = 0;
  note.setAttribute("role", "button");
  note.setAttribute("title", "Open sentence help.");
  note.setAttribute("aria-label", "Open sentence details");
  note.setAttribute("data-ik-sentence-note", "true");
  note.setAttribute("data-ik-sentence-hash", result.sentenceHash);
  note.setAttribute("data-ik-source-visible", "false");
  note.setAttribute(SENTENCE_KIND_ATTRIBUTE, sentenceKind);
  note.setAttribute(IMMERSIONKIT_NODE_ATTRIBUTE, nodeId);

  updateSentenceNote(note, result, sentenceKind);
  return note;
}

function updateSentenceNote(
  note: HTMLElement,
  result: SentenceTranslationResult,
  sentenceKind: "known" | "unknown"
): void {
  note.setAttribute("title", "Open sentence help.");
  note.setAttribute("aria-label", "Open sentence details");
  note.setAttribute("data-ik-sentence-hash", result.sentenceHash);
  note.setAttribute(SENTENCE_KIND_ATTRIBUTE, sentenceKind);
  note.setAttribute(SENTENCE_SOURCE_TEXT_ATTRIBUTE, result.sourceText);
  note.setAttribute(SENTENCE_TRANSLATED_TEXT_ATTRIBUTE, result.translatedText);
  note.setAttribute(
    SENTENCE_LEARNING_NOTE_ATTRIBUTE,
    JSON.stringify(result.learningNote)
  );
  note.setAttribute(
    SENTENCE_GRAMMAR_CARDS_ATTRIBUTE,
    JSON.stringify(result.grammarCards ?? [])
  );

  const translated = ensureChild(note, "ik-sentence-note__translated");
  translated.textContent = result.translatedText;

  const source = ensureChild(note, "ik-sentence-note__source");
  source.textContent = result.sourceText;
}

function ensureChild(note: HTMLElement, className: string): HTMLElement {
  const existingChild = note.querySelector<HTMLElement>(`.${className}`);
  if (existingChild) {
    return existingChild;
  }

  const child = document.createElement("span");
  child.className = className;
  note.append(child);
  return child;
}

function createSentenceSpacingGuard(minCharGap: number): {
  canPlace: (node: ChildNode) => boolean;
} {
  const offsetsByContainer = new Map<HTMLElement, number[]>();

  return {
    canPlace(node) {
      if (!(node instanceof HTMLElement)) {
        return true;
      }

      const container = findSentenceContainer(node);
      const wrapperOffset = readTextOffsetWithin(container, node);
      if (wrapperOffset === null) {
        return true;
      }

      let offsets = offsetsByContainer.get(container);
      if (!offsets) {
        offsets = readExistingSentenceOffsets(container);
        offsetsByContainer.set(container, offsets);
      }

      for (const offset of offsets) {
        if (Math.abs(offset - wrapperOffset) < minCharGap) {
          return false;
        }
      }

      offsets.push(wrapperOffset);
      return true;
    }
  };
}

function readExistingSentenceOffsets(container: HTMLElement): number[] {
  const offsets: number[] = [];
  const notes = container.querySelectorAll<HTMLElement>(SENTENCE_NOTE_SELECTOR);

  for (const note of notes) {
    const offset = readTextOffsetWithin(container, note);
    if (offset === null) {
      continue;
    }

    offsets.push(offset);
  }

  return offsets;
}

function findSentenceContainer(wrapper: HTMLElement): HTMLElement {
  let current: HTMLElement | null = wrapper.parentElement;

  while (current && current !== document.body) {
    if (isBlockContainer(current)) {
      return current;
    }

    current = current.parentElement;
  }

  if (document.body) {
    return document.body;
  }

  return document.documentElement;
}

function isBlockContainer(element: HTMLElement): boolean {
  const display = window.getComputedStyle(element).display;
  return display !== "contents" && !display.startsWith("inline");
}

function readTextOffsetWithin(
  container: HTMLElement,
  node: Node
): number | null {
  if (!container.contains(node)) {
    return null;
  }

  const range = document.createRange();
  range.selectNodeContents(container);

  try {
    range.setEndBefore(node);
  } catch {
    return null;
  }

  return range.toString().length;
}

function normalizeSentenceTranslationResult(
  value: unknown
): SentenceTranslationResult | null {
  if (!isRecord(value)) {
    return null;
  }

  const sentenceHash = readNonEmptyString(value.sentenceHash);
  const sourceText = readNonEmptyString(value.sourceText);
  const translatedText = readNonEmptyString(value.translatedText);
  const grammarCards = normalizeSentenceGrammarCards(value.grammarCards);
  const learningNote =
    normalizeSentenceLearningNote(value.learningNote) ??
    (grammarCards[0]
      ? createSentenceLearningNote({ summary: grammarCards[0].explanation })
      : null);

  if (!sentenceHash || !sourceText || !translatedText || !learningNote) {
    return null;
  }

  return {
    sentenceHash,
    sourceText,
    translatedText,
    learningNote,
    grammarCards
  };
}

function dedupeBySentenceHash(
  results: readonly SentenceTranslationResult[]
): SentenceTranslationResult[] {
  const byHash = new Map<string, SentenceTranslationResult>();

  for (const result of results) {
    byHash.set(result.sentenceHash, result);
  }

  return [...byHash.values()];
}

function escapeSelectorValue(value: string): string {
  const cssEscape = globalThis.CSS?.escape;
  if (typeof cssEscape === "function") {
    return cssEscape(value);
  }

  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readSentenceLearningNote(note: HTMLElement): SentenceLearningNote | null {
  const encodedLearningNote = note.getAttribute(SENTENCE_LEARNING_NOTE_ATTRIBUTE);

  if (encodedLearningNote) {
    try {
      const parsed = JSON.parse(encodedLearningNote) as unknown;
      const learningNote = normalizeSentenceLearningNote(parsed);
      if (learningNote) {
        return learningNote;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function readSentenceGrammarCards(note: HTMLElement): SentenceGrammarCard[] {
  const raw = note.getAttribute(SENTENCE_GRAMMAR_CARDS_ATTRIBUTE);
  if (!raw) {
    return [];
  }

  try {
    return normalizeSentenceGrammarCards(JSON.parse(raw));
  } catch {
    return [];
  }
}

function normalizeSentenceGrammarCards(value: unknown): SentenceGrammarCard[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const card = entry as Partial<SentenceGrammarCard>;
    const conceptId = readNonEmptyString(card.conceptId);
    const featureKey = readNonEmptyString(card.featureKey);
    const sentenceHash = readNonEmptyString(card.sentenceHash);
    const sourceText = readNonEmptyString(card.sourceText);
    const title = readNonEmptyString(card.title);
    const explanation = readNonEmptyString(card.explanation);
    const sourcePatternLabel = readNonEmptyString(card.sourcePatternLabel);
    const targetPatternLabel = readNonEmptyString(card.targetPatternLabel);
    const bandId = readNonEmptyString(card.bandId);
    const exposureItemId = readNonEmptyString(card.exposureItemId);
    if (
      !conceptId ||
      !featureKey ||
      !sentenceHash ||
      !sourceText ||
      !title ||
      !explanation ||
      !sourcePatternLabel ||
      !targetPatternLabel ||
      !card.sourceSpan ||
      typeof card.sourceSpan.startChar !== "number" ||
      typeof card.sourceSpan.endChar !== "number" ||
      !bandId ||
      !exposureItemId
    ) {
      return [];
    }

    return [
      {
        conceptId,
        featureKey,
        sentenceHash,
        sourceSpan: {
          startToken: Number(card.sourceSpan.startToken) || 0,
          endToken: Number(card.sourceSpan.endToken) || 0,
          startChar: card.sourceSpan.startChar,
          endChar: card.sourceSpan.endChar
        },
        sourceText,
        title,
        explanation,
        sourcePatternLabel,
        targetPatternLabel,
        exampleMapping: readNonEmptyString(card.exampleMapping) ?? null,
        curriculumReason:
          readNonEmptyString(card.curriculumReason) ??
          "This pattern fits your current reading focus.",
        bandId,
        curriculumStatus:
          card.curriculumStatus === "review" || card.curriculumStatus === "stretch"
            ? card.curriculumStatus
            : "focus",
        exposureItemId,
        confidence:
          typeof card.confidence === "number" && Number.isFinite(card.confidence)
            ? Math.max(0, Math.min(1, card.confidence))
            : 0
      }
    ];
  });
}

function normalizeSentenceLearningNote(value: unknown): SentenceLearningNote | null {
  if (isRecord(value)) {
    const learningNote = createSentenceLearningNote({
      summary: readNonEmptyString(value.summary) ?? undefined,
      literalGloss: readNonEmptyString(value.literalGloss) ?? undefined,
      keyPhrase: readNonEmptyString(value.keyPhrase) ?? undefined,
      canonicalUsage: readNonEmptyString(value.canonicalUsage) ?? undefined,
      grammarFocus: readNonEmptyString(value.grammarFocus) ?? undefined
    });

    if (hasSentenceLearningNoteContent(learningNote)) {
      return learningNote;
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isQueryRoot(
  value: ParentNode
): value is ParentNode & Pick<Document, "querySelectorAll"> {
  return typeof (value as { querySelectorAll?: unknown }).querySelectorAll === "function";
}
