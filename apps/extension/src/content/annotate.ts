import { hashString } from "@immersionkit/shared";
import type { SeedLexiconEntry, UserVocabEntry, VocabStatus } from "@immersionkit/shared";

import {
  IMMERSIONKIT_NODE_ATTRIBUTE,
  IMMERSIONKIT_ORIGINAL_TEXT_ATTRIBUTE,
  IMMERSIONKIT_TOKEN_ATTRIBUTE,
  MAX_SENTENCE_METADATA_LENGTH
} from "./constants";
import type {
  InjectedWordKind,
  SentenceCandidateMetadata,
  TokenMetadata,
  TokenStatusUpdatedDetail
} from "./contracts";
import { findSentenceForOffset, scoreSentenceCandidates, segmentSentences } from "./sentences";
import { preserveWordCasing, segmentText } from "./tokenize";

export type ProcessTextNodeContext = {
  discoveryRate: number;
  samplingSeed: string;
  createNodeId: () => string;
  lexiconLookup: Map<string, SeedLexiconEntry>;
  vocabByLemmaId: Map<string, UserVocabEntry>;
  isKnownWordForScoring: (word: string) => boolean;
};

export type ProcessTextNodeResult = {
  replaced: boolean;
  injectedCount: number;
  knownCount: number;
  discoveryCount: number;
  sentenceCandidates: SentenceCandidateMetadata[];
};

export function processTextNode(
  node: Text,
  context: ProcessTextNodeContext
): ProcessTextNodeResult {
  const sourceText = node.nodeValue ?? "";
  if (!sourceText.trim()) {
    return emptyResult();
  }

  const segments = segmentText(sourceText);
  if (segments.length === 0) {
    return emptyResult();
  }

  const sentences = segmentSentences(sourceText);
  const injectedSentenceHashes = new Set<string>();
  const wrapper = document.createElement("span");
  const nodeId = context.createNodeId();

  wrapper.className = "ik-node";
  wrapper.setAttribute(IMMERSIONKIT_NODE_ATTRIBUTE, nodeId);
  wrapper.setAttribute(IMMERSIONKIT_ORIGINAL_TEXT_ATTRIBUTE, encodeOriginalText(sourceText));

  let injectedCount = 0;
  let knownCount = 0;
  let discoveryCount = 0;
  let tokenIndex = 0;

  for (const segment of segments) {
    if (segment.kind === "text") {
      wrapper.append(segment.value);
      continue;
    }

    const lexiconEntry = context.lexiconLookup.get(segment.normalized);
    if (!lexiconEntry) {
      wrapper.append(segment.value);
      continue;
    }

    const status = getVocabStatus(lexiconEntry.lemmaId, context.vocabByLemmaId);
    if (status === "ignored") {
      wrapper.append(segment.value);
      continue;
    }

    const wordKind: InjectedWordKind = status === "known" ? "known" : "discovery";
    if (
      wordKind === "discovery" &&
      !shouldInjectDiscoveryToken(
        `${context.samplingSeed}:${segment.normalized}:${segment.start}`,
        context.discoveryRate
      )
    ) {
      wrapper.append(segment.value);
      continue;
    }

    const replacement = preserveWordCasing(segment.value, lexiconEntry.targetLemma);
    const sentence = findSentenceForOffset(sentences, segment.start);
    if (sentence) {
      injectedSentenceHashes.add(sentence.hash);
    }

    const tokenId = `${nodeId}-t${tokenIndex}`;
    tokenIndex += 1;

    const tokenElement = createTokenElement({
      tokenId,
      nodeId,
      sourceToken: segment.value,
      targetToken: replacement,
      sentence,
      lexiconEntry,
      status,
      wordKind
    });

    wrapper.append(tokenElement);
    injectedCount += 1;

    if (wordKind === "known") {
      knownCount += 1;
    } else {
      discoveryCount += 1;
    }
  }

  if (injectedCount === 0) {
    return emptyResult();
  }

  node.replaceWith(wrapper);

  return {
    replaced: true,
    injectedCount,
    knownCount,
    discoveryCount,
    sentenceCandidates: scoreSentenceCandidates(
      sentences,
      nodeId,
      injectedSentenceHashes,
      context.isKnownWordForScoring
    )
  };
}

export function restoreAnnotatedNodes(root: ParentNode = document): number {
  const queryRoot = isQueryRoot(root) ? root : document;

  const wrappers = queryRoot.querySelectorAll<HTMLElement>(
    `[${IMMERSIONKIT_NODE_ATTRIBUTE}][${IMMERSIONKIT_ORIGINAL_TEXT_ATTRIBUTE}]`
  );

  for (const wrapper of wrappers) {
    const encodedText = wrapper.getAttribute(IMMERSIONKIT_ORIGINAL_TEXT_ATTRIBUTE);
    const originalText = decodeOriginalText(encodedText);
    wrapper.replaceWith(document.createTextNode(originalText));
  }

  return wrappers.length;
}

export function readTokenMetadata(tokenElement: HTMLElement): TokenMetadata | null {
  const tokenId = tokenElement.getAttribute(IMMERSIONKIT_TOKEN_ATTRIBUTE);
  const nodeId = tokenElement.getAttribute(IMMERSIONKIT_NODE_ATTRIBUTE);
  const sourceToken = tokenElement.getAttribute("data-ik-source-token");
  const targetToken = tokenElement.getAttribute("data-ik-target-token");
  const sourceLemma = tokenElement.getAttribute("data-ik-source-lemma");
  const lemmaId = tokenElement.getAttribute("data-ik-lemma-id");
  const pos = tokenElement.getAttribute("data-ik-pos");
  const status = tokenElement.getAttribute("data-ik-status");
  const wordKind = tokenElement.getAttribute("data-ik-word-kind");

  if (
    !tokenId ||
    !nodeId ||
    !sourceToken ||
    !targetToken ||
    !sourceLemma ||
    !lemmaId ||
    !pos ||
    !status ||
    !wordKind
  ) {
    return null;
  }

  const safeStatus = normalizeStatus(status);
  const safeWordKind =
    wordKind === "known" || wordKind === "discovery" ? wordKind : "discovery";

  return {
    tokenId,
    nodeId,
    sourceLanguage: "en",
    targetLanguage: "es",
    sourceToken,
    targetToken,
    sourceLemma,
    lemmaId,
    pos: pos as SeedLexiconEntry["pos"],
    status: safeStatus,
    wordKind: safeWordKind,
    sentence: tokenElement.getAttribute("data-ik-sentence"),
    sentenceHash: tokenElement.getAttribute("data-ik-sentence-hash")
  };
}

export function applyTokenStatusUpdate(update: TokenStatusUpdatedDetail): boolean {
  const token = document.querySelector<HTMLElement>(
    `[${IMMERSIONKIT_TOKEN_ATTRIBUTE}='${update.tokenId}']`
  );

  if (!token) {
    return false;
  }

  token.setAttribute("data-ik-status", update.status);
  token.classList.remove("ik-word--known", "ik-word--discovery", "ik-word--ignored");

  if (update.status === "known") {
    const targetToken = token.getAttribute("data-ik-target-token");
    if (targetToken) {
      token.textContent = targetToken;
    }

    token.classList.add("ik-word--known");
    token.setAttribute("data-ik-word-kind", "known");
    return true;
  }

  if (update.status === "ignored") {
    const sourceToken = token.getAttribute("data-ik-source-token");
    if (sourceToken) {
      token.textContent = sourceToken;
    }

    token.classList.add("ik-word--ignored");
    token.setAttribute("data-ik-word-kind", "discovery");
    return true;
  }

  const targetToken = token.getAttribute("data-ik-target-token");
  if (targetToken) {
    token.textContent = targetToken;
  }

  token.classList.add("ik-word--discovery");
  token.setAttribute("data-ik-word-kind", "discovery");
  return true;
}

function createTokenElement(input: {
  tokenId: string;
  nodeId: string;
  sourceToken: string;
  targetToken: string;
  sentence: {
    text: string;
    hash: string;
  } | null;
  lexiconEntry: SeedLexiconEntry;
  status: VocabStatus;
  wordKind: InjectedWordKind;
}): HTMLSpanElement {
  const element = document.createElement("span");

  element.className = `ik-word ik-word--${input.wordKind}`;
  element.textContent = input.targetToken;
  element.tabIndex = 0;
  element.setAttribute("role", "button");
  element.setAttribute("data-ik-source-language", "en");
  element.setAttribute("data-ik-target-language", "es");
  element.setAttribute(IMMERSIONKIT_TOKEN_ATTRIBUTE, input.tokenId);
  element.setAttribute(IMMERSIONKIT_NODE_ATTRIBUTE, input.nodeId);
  element.setAttribute("data-ik-source-token", input.sourceToken);
  element.setAttribute("data-ik-target-token", input.targetToken);
  element.setAttribute("data-ik-source-lemma", input.lexiconEntry.sourceLemma);
  element.setAttribute("data-ik-lemma-id", input.lexiconEntry.lemmaId);
  element.setAttribute("data-ik-status", input.status);
  element.setAttribute("data-ik-pos", input.lexiconEntry.pos);
  element.setAttribute("data-ik-word-kind", input.wordKind);
  element.setAttribute(
    "aria-label",
    `${input.sourceToken} translated to ${input.targetToken}`
  );

  if (input.sentence) {
    element.setAttribute(
      "data-ik-sentence",
      truncateSentenceMetadata(input.sentence.text)
    );
    element.setAttribute("data-ik-sentence-hash", input.sentence.hash);
  }

  return element;
}

function truncateSentenceMetadata(input: string): string {
  if (input.length <= MAX_SENTENCE_METADATA_LENGTH) {
    return input;
  }

  return `${input.slice(0, MAX_SENTENCE_METADATA_LENGTH).trimEnd()}...`;
}

function encodeOriginalText(input: string): string {
  return encodeURIComponent(input);
}

function decodeOriginalText(input: string | null): string {
  if (!input) {
    return "";
  }

  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

function getVocabStatus(
  lemmaId: string,
  vocabByLemmaId: Map<string, UserVocabEntry>
): VocabStatus {
  const entry = vocabByLemmaId.get(lemmaId);
  return entry?.status ?? "new";
}

function shouldInjectDiscoveryToken(seed: string, discoveryRate: number): boolean {
  if (discoveryRate <= 0) {
    return false;
  }

  if (discoveryRate >= 1) {
    return true;
  }

  const hashPrefix = hashString(seed).slice(0, 8);
  const hashValue = Number.parseInt(hashPrefix, 16);
  return hashValue / 0xffffffff <= discoveryRate;
}

function normalizeStatus(status: string): VocabStatus {
  if (status === "known" || status === "learning" || status === "ignored") {
    return status;
  }

  return "new";
}

function isQueryRoot(
  value: ParentNode
): value is ParentNode & Pick<Document, "querySelectorAll"> {
  return typeof (value as { querySelectorAll?: unknown }).querySelectorAll === "function";
}

function emptyResult(): ProcessTextNodeResult {
  return {
    replaced: false,
    injectedCount: 0,
    knownCount: 0,
    discoveryCount: 0,
    sentenceCandidates: []
  };
}
