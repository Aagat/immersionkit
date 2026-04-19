import type { SentenceTranslationResult } from "@immersionkit/shared";

import {
  IMMERSIONKIT_NODE_ATTRIBUTE,
  IMMERSIONKIT_ORIGINAL_TEXT_ATTRIBUTE
} from "./constants";

const SENTENCE_NOTE_SELECTOR = "[data-ik-sentence-note='true']";
const SENTENCE_SOURCE_TEXT_ATTRIBUTE = "data-ik-sentence-source-text";
const SENTENCE_TRANSLATED_TEXT_ATTRIBUTE = "data-ik-sentence-translated-text";
const SENTENCE_GRAMMAR_NOTE_ATTRIBUTE = "data-ik-sentence-grammar-note";

export type SentenceNoteMetadata = {
  note: HTMLElement;
  sentenceHash: string;
  sourceText: string;
  translatedText: string;
  grammarNote: string;
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
  results: readonly SentenceTranslationResult[]
): number {
  if (results.length === 0) {
    return 0;
  }

  const dedupedResults = dedupeBySentenceHash(results);
  let renderedCount = 0;

  for (const result of dedupedResults) {
    const anchors = collectSentenceAnchors(result.sentenceHash);

    for (const anchor of anchors) {
      const existingNote = findSentenceNote(anchor.nodeId, result.sentenceHash);
      if (existingNote) {
        updateSentenceNote(existingNote, result);
        renderedCount += 1;
        continue;
      }

      const note = createSentenceNote(result, anchor.nodeId);
      anchor.wrapper.after(note);
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
  const grammarNote = readNonEmptyString(note.getAttribute(SENTENCE_GRAMMAR_NOTE_ATTRIBUTE));

  if (!sentenceHash || !sourceText || !translatedText || !grammarNote) {
    return null;
  }

  return {
    note,
    sentenceHash,
    sourceText,
    translatedText,
    grammarNote
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
  sentenceHash: string
): {
  nodeId: string;
  wrapper: HTMLElement;
}[] {
  const escapedHash = escapeSelectorValue(sentenceHash);
  const tokenMatches = document.querySelectorAll<HTMLElement>(
    `[data-ik-sentence-hash="${escapedHash}"][${IMMERSIONKIT_NODE_ATTRIBUTE}]`
  );

  const anchors = new Map<string, HTMLElement>();
  for (const match of tokenMatches) {
    const nodeId = match.getAttribute(IMMERSIONKIT_NODE_ATTRIBUTE);
    if (!nodeId || anchors.has(nodeId)) {
      continue;
    }

    const escapedNodeId = escapeSelectorValue(nodeId);
    const wrapper = document.querySelector<HTMLElement>(
      `[${IMMERSIONKIT_NODE_ATTRIBUTE}="${escapedNodeId}"][${IMMERSIONKIT_ORIGINAL_TEXT_ATTRIBUTE}]`
    );

    if (wrapper) {
      anchors.set(nodeId, wrapper);
    }
  }

  return [...anchors.entries()].map(([nodeId, wrapper]) => ({
    nodeId,
    wrapper
  }));
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
  nodeId: string
): HTMLElement {
  const note = document.createElement("span");

  note.className = "ik-sentence-note";
  note.tabIndex = 0;
  note.setAttribute("role", "button");
  note.setAttribute("title", "Click for details. Double-click to reveal original.");
  note.setAttribute("aria-label", "Open sentence details");
  note.setAttribute("data-ik-sentence-note", "true");
  note.setAttribute("data-ik-sentence-hash", result.sentenceHash);
  note.setAttribute("data-ik-source-visible", "false");
  note.setAttribute(IMMERSIONKIT_NODE_ATTRIBUTE, nodeId);

  updateSentenceNote(note, result);
  return note;
}

function updateSentenceNote(
  note: HTMLElement,
  result: SentenceTranslationResult
): void {
  note.setAttribute("title", "Click for details. Double-click to reveal original.");
  note.setAttribute("aria-label", "Open sentence details");
  note.setAttribute("data-ik-sentence-hash", result.sentenceHash);
  note.setAttribute(SENTENCE_SOURCE_TEXT_ATTRIBUTE, result.sourceText);
  note.setAttribute(SENTENCE_TRANSLATED_TEXT_ATTRIBUTE, result.translatedText);
  note.setAttribute(SENTENCE_GRAMMAR_NOTE_ATTRIBUTE, result.grammarNote);

  const translated = ensureChild(note, "ik-sentence-note__translated");
  translated.textContent = result.translatedText;

  const source = ensureChild(note, "ik-sentence-note__source");
  source.textContent = result.sourceText;

  const legacyGrammar = note.querySelector<HTMLElement>(".ik-sentence-note__grammar");
  legacyGrammar?.remove();
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

function normalizeSentenceTranslationResult(
  value: unknown
): SentenceTranslationResult | null {
  if (!isRecord(value)) {
    return null;
  }

  const sentenceHash = readNonEmptyString(value.sentenceHash);
  const sourceText = readNonEmptyString(value.sourceText);
  const translatedText = readNonEmptyString(value.translatedText);
  const grammarNote = readNonEmptyString(value.grammarNote);

  if (!sentenceHash || !sourceText || !translatedText || !grammarNote) {
    return null;
  }

  return {
    sentenceHash,
    sourceText,
    translatedText,
    grammarNote
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isQueryRoot(
  value: ParentNode
): value is ParentNode & Pick<Document, "querySelectorAll"> {
  return typeof (value as { querySelectorAll?: unknown }).querySelectorAll === "function";
}
