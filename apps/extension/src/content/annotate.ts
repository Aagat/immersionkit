import { hashString, normalizeToken } from "@immersionkit/shared";
import type {
  LearningItem,
  SentenceAnalysisEntry,
  UserVocabEntry,
  VocabStatus
} from "@immersionkit/shared";
import type { WordRenderEntry } from "../render-units/render-units";

import {
  IMMERSIONKIT_NODE_ATTRIBUTE,
  IMMERSIONKIT_ORIGINAL_TEXT_ATTRIBUTE,
  IMMERSIONKIT_TOKEN_ATTRIBUTE,
  MAX_SENTENCE_METADATA_LENGTH,
  MAX_TEXT_NODE_LENGTH
} from "./constants";
import type {
  InjectedWordKind,
  PhraseMetadata,
  SentenceCandidateMetadata,
  TokenMetadata,
  TokenStatusUpdatedDetail
} from "./contracts";
import { findSentenceForOffset, scoreSentenceCandidates, segmentSentences } from "./sentences";
import type { CachedPhraseMatch, CachedWordRenderDecision } from "./storage";
import { preserveWordCasing, segmentText } from "./tokenize";

export type ProcessTextNodeContext = {
  discoveryRate: number;
  samplingSeed: string;
  createNodeId: () => string;
  wordRenderIndex: Map<string, WordRenderEntry>;
  vocabByLexemeId: Map<string, UserVocabEntry>;
  isKnownWordForScoring: (word: string) => boolean;
  isDueForReview?: (lexemeId: string) => boolean;
  cachedWordRenderDecisions?: Map<string, CachedWordRenderDecision[]>;
  cachedPhraseMatchesBySentenceHash?: Map<string, CachedPhraseMatch[]>;
  sentenceHintPhrases?: readonly string[];
  learningItemsByUnitRefId?: Map<string, LearningItem>;
  shouldActivateWord?: (input: WordActivationInput) => ActivationDecision;
  shouldActivatePhrase?: (input: PhraseActivationInput) => ActivationDecision;
  allowPhraseOnlyCandidates?: boolean;
};

export type ProcessTextNodeResult = {
  replaced: boolean;
  injectedCount: number;
  knownCount: number;
  discoveryCount: number;
  contextSkippedCount: number;
  phraseInjectedCount: number;
  phraseRejectedCount: number;
  curriculumSkippedWordCount: number;
  curriculumSkippedPhraseCount: number;
  sentenceCandidates: SentenceCandidateMetadata[];
  unrenderedPhraseRejections: PhraseRenderRejection[];
};

export type ActivationDecision = {
  eligible: boolean;
  configId?: string;
  activeBandId?: string | null;
  discoveryRateFloor?: number | null;
  activationReason?: string | null;
  skipReason?: string | null;
};

export type WordActivationInput = {
  wordEntry: WordRenderEntry;
  learningItem: LearningItem | null;
  status: VocabStatus;
  isDueForReview: boolean;
};

export type PhraseActivationInput = {
  phraseId: string;
  sourceText: string;
  learningItem: LearningItem;
  confidence: number;
  sourceKind: CachedPhraseMatch["sourceKind"];
  category: CachedPhraseMatch["category"];
  renderUnitMinBand?: string;
  isDueForReview: boolean;
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

  const windows = splitTextIntoProcessableWindows(sourceText);
  if (windows.length > 1) {
    return processWindowedTextNode(node, context, windows);
  }

  const rendered = renderTextWindow({
    sourceText,
    context,
    offsetBase: 0
  });
  if (!rendered.replaced) {
    return rendered.result;
  }

  node.replaceWith(rendered.node);

  return rendered.result;
}

function processWindowedTextNode(
  node: Text,
  context: ProcessTextNodeContext,
  windows: readonly TextWindow[]
): ProcessTextNodeResult {
  const fragment = document.createDocumentFragment();
  const mergedResult = emptyResult();

  for (const window of windows) {
    const rendered = renderTextWindow({
      sourceText: window.text,
      context,
      offsetBase: window.start
    });

    mergedResult.injectedCount += rendered.result.injectedCount;
    mergedResult.knownCount += rendered.result.knownCount;
    mergedResult.discoveryCount += rendered.result.discoveryCount;
    mergedResult.contextSkippedCount += rendered.result.contextSkippedCount;
    mergedResult.phraseInjectedCount += rendered.result.phraseInjectedCount;
    mergedResult.phraseRejectedCount += rendered.result.phraseRejectedCount;
    mergedResult.curriculumSkippedWordCount +=
      rendered.result.curriculumSkippedWordCount;
    mergedResult.curriculumSkippedPhraseCount +=
      rendered.result.curriculumSkippedPhraseCount;
    mergedResult.sentenceCandidates.push(...rendered.result.sentenceCandidates);
    mergedResult.unrenderedPhraseRejections.push(
      ...rendered.result.unrenderedPhraseRejections
    );

    if (rendered.replaced) {
      fragment.append(rendered.node);
      mergedResult.replaced = true;
    } else {
      fragment.append(window.text);
    }
  }

  if (!mergedResult.replaced) {
    return mergedResult;
  }

  node.replaceWith(fragment);
  return mergedResult;
}

function renderTextWindow(input: {
  sourceText: string;
  context: ProcessTextNodeContext;
  offsetBase: number;
}): {
  replaced: boolean;
  node: Node;
  result: ProcessTextNodeResult;
} {
  const { sourceText, context, offsetBase } = input;
  const segments = segmentText(sourceText);
  if (segments.length === 0) {
    return {
      replaced: false,
      node: document.createTextNode(sourceText),
      result: emptyResult()
    };
  }

  const sentences = segmentSentences(sourceText, context.sentenceHintPhrases);
  const phraseCandidates = selectPhraseRenderCandidates({
    sourceText,
    sentences,
    cachedPhraseMatchesBySentenceHash: context.cachedPhraseMatchesBySentenceHash,
    learningItemsByUnitRefId: context.learningItemsByUnitRefId,
    shouldActivatePhrase: context.shouldActivatePhrase
  });
  const injectedSentenceHashes = new Set<string>();
  const wrapper = document.createElement("span");
  const nodeId = context.createNodeId();

  wrapper.className = "ik-node";
  wrapper.setAttribute(IMMERSIONKIT_NODE_ATTRIBUTE, nodeId);
  wrapper.setAttribute(IMMERSIONKIT_ORIGINAL_TEXT_ATTRIBUTE, encodeOriginalText(sourceText));
  wrapper.setAttribute("data-ik-render-layer", "word");

  let injectedCount = 0;
  let knownCount = 0;
  let discoveryCount = 0;
  let contextSkippedCount = 0;
  let curriculumSkippedWordCount = 0;
  let phraseInjectedCount = 0;
  let tokenIndex = 0;
  let cursor = 0;

  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const segment = segments[segmentIndex];
    const phraseCandidate = phraseCandidates.acceptedByStart.get(segment.start);
    if (phraseCandidate) {
      if (cursor < phraseCandidate.start) {
        wrapper.append(sourceText.slice(cursor, phraseCandidate.start));
      }

      const tokenId = `${nodeId}-t${tokenIndex}`;
      tokenIndex += 1;
      wrapper.append(
        createPhraseElement({
          tokenId,
          nodeId,
          sourceText: sourceText.slice(phraseCandidate.start, phraseCandidate.end),
          targetText: phraseCandidate.targetText,
          sentence: phraseCandidate.sentence,
          phraseId: phraseCandidate.phraseId,
          itemId: phraseCandidate.itemId,
          category: phraseCandidate.category,
          sourceKind: phraseCandidate.sourceKind,
          ruleId: phraseCandidate.ruleId,
          confidence: phraseCandidate.confidence,
          isDueForReview: phraseCandidate.isDueForReview
        })
      );

      injectedSentenceHashes.add(phraseCandidate.sentence.hash);
      injectedCount += 1;
      discoveryCount += 1;
      phraseInjectedCount += 1;
      cursor = phraseCandidate.end;
      continue;
    }

    if (segment.start < cursor) {
      continue;
    }

    if (cursor < segment.start) {
      wrapper.append(sourceText.slice(cursor, segment.start));
    }

    if (segment.kind === "text") {
      wrapper.append(segment.value);
      cursor = segment.end;
      continue;
    }

    const sentence = findSentenceForOffset(sentences, segment.start);
    const cachedInjectDecision = sentence
      ? findCachedWordRenderDecision({
          decisionsBySentenceHash: context.cachedWordRenderDecisions,
          sentenceHash: sentence.hash,
          sourceToken: segment.value,
          decision: "inject"
        })
      : null;
    const wordEntry =
      context.wordRenderIndex.get(segment.normalized) ??
      createWordEntryFromCachedDecision(cachedInjectDecision);
    if (!wordEntry) {
      wrapper.append(segment.value);
      cursor = segment.end;
      continue;
    }

    const status = getVocabStatus(wordEntry.lexemeId, context.vocabByLexemeId);
    if (status === "ignored") {
      wrapper.append(segment.value);
      cursor = segment.end;
      continue;
    }

    const wordKind: InjectedWordKind = status === "known" ? "known" : "discovery";
    const isDueForReview = context.isDueForReview?.(wordEntry.lexemeId) ?? false;
    const learningItem =
      context.learningItemsByUnitRefId?.get(wordEntry.lexemeId) ?? null;
    let activationDecision: ActivationDecision | null = null;
    if (
      status === "new" &&
      !isDueForReview &&
      context.shouldActivateWord
    ) {
      activationDecision = context.shouldActivateWord({
        wordEntry,
        learningItem,
        status,
        isDueForReview
      });
      if (!activationDecision.eligible) {
        wrapper.append(segment.value);
        curriculumSkippedWordCount += 1;
        cursor = segment.end;
        continue;
      }
    }

    if (
      wordKind === "discovery" &&
      !isDueForReview &&
      !shouldInjectDiscoveryToken(
        `${context.samplingSeed}:${segment.normalized}:${offsetBase + segment.start}`,
        effectiveDiscoveryRate(context.discoveryRate, activationDecision)
      )
    ) {
      wrapper.append(segment.value);
      cursor = segment.end;
      continue;
    }

    const cachedSkipDecision = sentence
      ? findCachedSkipDecision({
          decisionsBySentenceHash: context.cachedWordRenderDecisions,
          sentenceHash: sentence.hash,
          lexemeId: wordEntry.lexemeId,
          renderUnitId: wordEntry.renderUnitId,
          sourceToken: segment.value
        })
      : null;
    if (cachedSkipDecision) {
      wrapper.append(segment.value);
      contextSkippedCount += 1;
      cursor = segment.end;
      continue;
    }

    const replacement = preserveWordCasing(segment.value, wordEntry.targetLemma);
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
      wordEntry,
      status,
      wordKind,
      isDueForReview,
      activationReason: activationDecision?.activationReason ?? null
    });

    wrapper.append(tokenElement);
    cursor = segment.end;
    injectedCount += 1;

    if (wordKind === "known") {
      knownCount += 1;
    } else {
      discoveryCount += 1;
    }
  }

  if (cursor < sourceText.length) {
    wrapper.append(sourceText.slice(cursor));
  }

  const scoredSentenceCandidates = scoreSentenceCandidates(
    sentences,
    nodeId,
    injectedSentenceHashes,
    context.isKnownWordForScoring
  );
  const sentenceCandidates = context.allowPhraseOnlyCandidates
    ? scoredSentenceCandidates
    : scoredSentenceCandidates.filter((candidate) => candidate.reason === "injected-token");

  const phraseHints = collectCandidatePhraseHints(sentenceCandidates);
  if (phraseHints.length > 0) {
    wrapper.setAttribute("data-ik-render-layer", "word phrase-candidate");
    wrapper.setAttribute("data-ik-phrase-hints", phraseHints.join("|"));
  }

  if (phraseInjectedCount > 0) {
    wrapper.setAttribute(
      "data-ik-render-layer",
      phraseHints.length > 0 ? "word phrase phrase-candidate" : "word phrase"
    );
    wrapper.setAttribute(
      "data-ik-phrase-selected",
      [...phraseCandidates.acceptedByStart.values()]
        .map((candidate) => candidate.phraseId)
        .join("|")
    );
  }

  if (phraseCandidates.rejected.length > 0) {
    wrapper.setAttribute(
      "data-ik-phrase-rejection-details",
      JSON.stringify(phraseCandidates.rejected.slice(0, 8))
    );
  }

  if (sentenceCandidates.length > 0) {
    wrapper.setAttribute(
      "data-ik-sentence-candidate-hashes",
      sentenceCandidates.map((candidate) => candidate.sentenceHash).join("|")
    );
  }

  if (injectedCount === 0 && sentenceCandidates.length === 0) {
    return {
      replaced: false,
      node: document.createTextNode(sourceText),
      result: {
        ...emptyResult(),
        contextSkippedCount,
        phraseRejectedCount: phraseCandidates.rejected.length,
        curriculumSkippedWordCount,
        curriculumSkippedPhraseCount: phraseCandidates.curriculumSkippedCount,
        unrenderedPhraseRejections: phraseCandidates.rejected
      }
    };
  }

  return {
    replaced: true,
    node: wrapper,
    result: {
      replaced: true,
      injectedCount,
      knownCount,
      discoveryCount,
      contextSkippedCount,
      phraseInjectedCount,
      phraseRejectedCount: phraseCandidates.rejected.length,
      curriculumSkippedWordCount,
      curriculumSkippedPhraseCount: phraseCandidates.curriculumSkippedCount,
      sentenceCandidates,
      unrenderedPhraseRejections: []
    }
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

export function readAnnotatedNodeOriginalText(wrapper: HTMLElement): string | null {
  if (
    !wrapper.hasAttribute(IMMERSIONKIT_NODE_ATTRIBUTE) ||
    !wrapper.hasAttribute(IMMERSIONKIT_ORIGINAL_TEXT_ATTRIBUTE)
  ) {
    return null;
  }

  return decodeOriginalText(wrapper.getAttribute(IMMERSIONKIT_ORIGINAL_TEXT_ATTRIBUTE));
}

export function restoreAnnotatedElement(wrapper: HTMLElement): Text | null {
  const originalText = readAnnotatedNodeOriginalText(wrapper);
  if (originalText === null) {
    return null;
  }

  const textNode = document.createTextNode(originalText);
  wrapper.replaceWith(textNode);
  return textNode;
}

export function readTokenMetadata(tokenElement: HTMLElement): TokenMetadata | null {
  const tokenId = tokenElement.getAttribute(IMMERSIONKIT_TOKEN_ATTRIBUTE);
  const nodeId = tokenElement.getAttribute(IMMERSIONKIT_NODE_ATTRIBUTE);
  const sourceToken = tokenElement.getAttribute("data-ik-source-token");
  const targetToken = tokenElement.getAttribute("data-ik-target-token");
  const sourceLemma = tokenElement.getAttribute("data-ik-source-lemma");
  const lexemeId = tokenElement.getAttribute("data-ik-lexeme-id");
  const renderUnitId = tokenElement.getAttribute("data-ik-render-unit-id");
  const pos = tokenElement.getAttribute("data-ik-pos");
  const status = tokenElement.getAttribute("data-ik-status");
  const wordKind = tokenElement.getAttribute("data-ik-word-kind");

  if (
    !tokenId ||
    !nodeId ||
    !sourceToken ||
    !targetToken ||
    !sourceLemma ||
    !lexemeId ||
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
    lexemeId,
    renderUnitId,
    pos: pos as WordRenderEntry["pos"],
    status: safeStatus,
    wordKind: safeWordKind,
    sentence: tokenElement.getAttribute("data-ik-sentence"),
    sentenceHash: tokenElement.getAttribute("data-ik-sentence-hash"),
    exampleSentenceEnglish: tokenElement.getAttribute("data-ik-example-sentence-english"),
    exampleSentenceNative: tokenElement.getAttribute("data-ik-example-sentence-native")
  };
}

export function readPhraseMetadata(tokenElement: HTMLElement): PhraseMetadata | null {
  const tokenId = tokenElement.getAttribute(IMMERSIONKIT_TOKEN_ATTRIBUTE);
  const nodeId = tokenElement.getAttribute(IMMERSIONKIT_NODE_ATTRIBUTE);
  const sourceText = tokenElement.getAttribute("data-ik-source-token");
  const targetText = tokenElement.getAttribute("data-ik-target-token");
  const phraseId = tokenElement.getAttribute("data-ik-phrase-id");
  const itemId = tokenElement.getAttribute("data-ik-item-id");
  const category = tokenElement.getAttribute("data-ik-phrase-category");
  const sourceKind = tokenElement.getAttribute("data-ik-phrase-source-kind");
  const ruleId = tokenElement.getAttribute("data-ik-phrase-rule-id");

  if (
    !tokenId ||
    !nodeId ||
    !sourceText ||
    !targetText ||
    !phraseId ||
    !itemId ||
    !category ||
    !sourceKind ||
    !ruleId
  ) {
    return null;
  }

  const rawConfidence = tokenElement.getAttribute("data-ik-phrase-confidence");
  const confidence = rawConfidence ? Number.parseFloat(rawConfidence) : Number.NaN;

  return {
    tokenId,
    nodeId,
    sourceLanguage: "en",
    targetLanguage: "es",
    sourceText,
    targetText,
    phraseId,
    itemId,
    category,
    sourceKind,
    ruleId,
    confidence: Number.isFinite(confidence) ? confidence : null,
    dueStatus: tokenElement.getAttribute("data-ik-due-status"),
    schedulerReason: tokenElement.getAttribute("data-ik-scheduler-reason"),
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
  token.setAttribute("data-status", toUiTokenStatus(update.status));

  if (update.status === "known") {
    const targetToken = token.getAttribute("data-ik-target-token");
    if (targetToken) {
      token.textContent = targetToken;
    }
    token.setAttribute("data-ik-word-kind", "known");
    return true;
  }

  if (update.status === "ignored") {
    const sourceToken = token.getAttribute("data-ik-source-token");
    if (sourceToken) {
      token.textContent = sourceToken;
    }
    token.setAttribute("data-ik-word-kind", "discovery");
    return true;
  }

  const targetToken = token.getAttribute("data-ik-target-token");
  if (targetToken) {
    token.textContent = targetToken;
  }
  token.setAttribute("data-ik-word-kind", "discovery");
  return true;
}

export function applySentenceAnalysisDecisions(
  entries: readonly SentenceAnalysisEntry[],
  root: ParentNode = document
): number {
  const queryRoot = isQueryRoot(root) ? root : document;
  let suppressedCount = 0;

  for (const entry of entries) {
    for (const candidate of entry.contextualWordCandidates) {
      if (candidate.decision !== "skip" || !candidate.lexemeId) {
        continue;
      }

      const selector = [
        `[data-ik-sentence-hash='${escapeSelector(entry.sentenceHash)}']`,
        `[data-ik-lexeme-id='${escapeSelector(candidate.lexemeId)}']`,
        candidate.renderUnitId
          ? `[data-ik-render-unit-id='${escapeSelector(candidate.renderUnitId)}']`
          : ""
      ].join("");
      const tokens = queryRoot.querySelectorAll<HTMLElement>(selector);

      for (const token of tokens) {
        if (token.getAttribute("data-ik-context-decision") === "skip") {
          continue;
        }

        const sourceToken = token.getAttribute("data-ik-source-token");
        const candidateToken = candidate.normalizedText ?? normalizeToken(candidate.tokenText);
        if (!sourceToken || normalizeToken(sourceToken) !== candidateToken) {
          continue;
        }

        token.textContent = sourceToken;
        token.setAttribute("data-status", "muted");
        token.setAttribute("data-ik-context-decision", "skip");
        token.setAttribute("data-ik-context-rationale", candidate.rationale ?? "");
        token.setAttribute(
          "aria-label",
          `${sourceToken} kept in English because the local meaning is ambiguous`
        );
        suppressedCount += 1;
      }
    }
  }

  return suppressedCount;
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
  wordEntry: WordRenderEntry;
  status: VocabStatus;
  wordKind: InjectedWordKind;
  isDueForReview: boolean;
  activationReason?: string | null;
}): HTMLSpanElement {
  const element = document.createElement("span");

  element.className = "ik-ui-mark ik-ui-mark--word";
  element.textContent = input.targetToken;
  element.tabIndex = 0;
  element.setAttribute("role", "button");
  element.setAttribute("data-ik-source-language", "en");
  element.setAttribute("data-ik-target-language", "es");
  element.setAttribute("data-ik-unit-kind", "word");
  element.setAttribute("data-kind", "word");
  element.setAttribute("data-status", toUiTokenStatus(input.status));
  element.setAttribute("data-ik-phrase-render-hook", "reserved");
  element.setAttribute(IMMERSIONKIT_TOKEN_ATTRIBUTE, input.tokenId);
  element.setAttribute(IMMERSIONKIT_NODE_ATTRIBUTE, input.nodeId);
  element.setAttribute("data-ik-source-token", input.sourceToken);
  element.setAttribute("data-ik-target-token", input.targetToken);
  element.setAttribute("data-ik-source-lemma", input.wordEntry.sourceLemma);
  element.setAttribute("data-ik-lexeme-id", input.wordEntry.lexemeId);
  element.setAttribute("data-ik-render-unit-id", input.wordEntry.renderUnitId);
  element.setAttribute(
    "data-ik-normalized-source-text",
    input.wordEntry.normalizedSourceText
  );
  element.setAttribute("data-ik-status", input.status);
  element.setAttribute("data-ik-pos", input.wordEntry.pos);
  element.setAttribute("data-ik-word-kind", input.wordKind);
  element.setAttribute("data-ik-context-decision", "inject");
  element.setAttribute("data-ik-due-status", input.isDueForReview ? "due" : "not-due");
  element.setAttribute(
    "data-ik-scheduler-reason",
    input.isDueForReview
      ? "due-review"
      : input.wordKind === "known"
        ? "known-status"
        : input.activationReason === "beginner-cognate"
          ? "beginner-cognate"
          : "discovery-sampling"
  );
  element.setAttribute(
    "aria-label",
    `${input.sourceToken} translated to ${input.targetToken}`
  );

  if (input.wordEntry.exampleSentenceEnglish) {
    element.setAttribute(
      "data-ik-example-sentence-english",
      input.wordEntry.exampleSentenceEnglish
    );
  }

  if (input.wordEntry.exampleSentenceNative) {
    element.setAttribute(
      "data-ik-example-sentence-native",
      input.wordEntry.exampleSentenceNative
    );
  }

  if (input.sentence) {
    element.setAttribute(
      "data-ik-sentence",
      truncateSentenceMetadata(input.sentence.text)
    );
    element.setAttribute("data-ik-sentence-hash", input.sentence.hash);
  }

  return element;
}

function createPhraseElement(input: {
  tokenId: string;
  nodeId: string;
  sourceText: string;
  targetText: string;
  sentence: {
    text: string;
    hash: string;
  };
  phraseId: string;
  itemId: string;
  category: string;
  sourceKind: string;
  ruleId: string;
  confidence: number;
  isDueForReview: boolean;
}): HTMLSpanElement {
  const element = document.createElement("span");

  element.className = "ik-ui-mark ik-ui-mark--phrase";
  element.textContent = preserveWordCasing(input.sourceText, input.targetText);
  element.tabIndex = 0;
  element.setAttribute("role", "button");
  element.setAttribute("data-ik-source-language", "en");
  element.setAttribute("data-ik-target-language", "es");
  element.setAttribute("data-ik-unit-kind", "phrase");
  element.setAttribute("data-kind", "phrase");
  element.setAttribute("data-status", input.isDueForReview ? "learning" : "new");
  element.setAttribute(IMMERSIONKIT_TOKEN_ATTRIBUTE, input.tokenId);
  element.setAttribute(IMMERSIONKIT_NODE_ATTRIBUTE, input.nodeId);
  element.setAttribute("data-ik-source-token", input.sourceText);
  element.setAttribute("data-ik-target-token", input.targetText);
  element.setAttribute("data-ik-phrase-id", input.phraseId);
  element.setAttribute("data-ik-item-id", input.itemId);
  element.setAttribute("data-ik-phrase-category", input.category);
  element.setAttribute("data-ik-phrase-source-kind", input.sourceKind);
  element.setAttribute("data-ik-phrase-rule-id", input.ruleId);
  element.setAttribute("data-ik-phrase-confidence", input.confidence.toFixed(3));
  element.setAttribute("data-ik-context-decision", "inject");
  element.setAttribute("data-ik-due-status", input.isDueForReview ? "due" : "not-due");
  element.setAttribute(
    "data-ik-scheduler-reason",
    input.isDueForReview ? "phrase-due-review" : "phrase-learning-item"
  );
  element.setAttribute("data-ik-sentence", truncateSentenceMetadata(input.sentence.text));
  element.setAttribute("data-ik-sentence-hash", input.sentence.hash);
  element.setAttribute(
    "aria-label",
    `${input.sourceText} translated to ${input.targetText}`
  );

  return element;
}

function toUiTokenStatus(status: VocabStatus): "new" | "learning" | "known" | "muted" {
  if (status === "ignored") {
    return "muted";
  }

  return status;
}

type PhraseRenderCandidate = {
  phraseId: string;
  itemId: string;
  sourceKind: string;
  category: string;
  ruleId: string;
  confidence: number;
  start: number;
  end: number;
  sourceText: string;
  targetText: string;
  sentence: {
    text: string;
    hash: string;
  };
  isDueForReview: boolean;
};

export type PhraseRenderRejection = {
  phraseId: string;
  reason: string;
  sourceText: string | null;
  targetText: string | null;
  sourceKind: string | null;
  category: string | null;
  sentenceHash: string | null;
};

function selectPhraseRenderCandidates(input: {
  sourceText: string;
  sentences: ReturnType<typeof segmentSentences>;
  cachedPhraseMatchesBySentenceHash?: Map<string, CachedPhraseMatch[]>;
  learningItemsByUnitRefId?: Map<string, LearningItem>;
  shouldActivatePhrase?: (input: PhraseActivationInput) => ActivationDecision;
}): {
  acceptedByStart: Map<number, PhraseRenderCandidate>;
  rejected: PhraseRenderRejection[];
  curriculumSkippedCount: number;
} {
  const acceptedByStart = new Map<number, PhraseRenderCandidate>();
  const rejected: PhraseRenderRejection[] = [];
  const candidates: PhraseRenderCandidate[] = [];
  let curriculumSkippedCount = 0;

  for (const sentence of input.sentences) {
    const matches = input.cachedPhraseMatchesBySentenceHash?.get(sentence.hash) ?? [];
    for (const match of matches) {
      const learningItem = input.learningItemsByUnitRefId?.get(match.phraseId);
      if (!learningItem || learningItem.unitType !== "phrase" || learningItem.suspended) {
        rejected.push(
          createPhraseRenderRejection(
            match,
            sentence.hash,
            "missing-active-learning-item"
          )
        );
        continue;
      }

      if (!hasUsablePhraseTarget(learningItem.targetText)) {
        rejected.push(
          createPhraseRenderRejection(match, sentence.hash, "blank-target", {
            targetText: learningItem.targetText
          })
        );
        continue;
      }

      const start = sentence.start + match.span.startChar;
      const end = sentence.start + match.span.endChar;
      const sourceSlice = input.sourceText.slice(start, end);
      if (
        start < sentence.start ||
        end > sentence.end ||
        normalizePhraseText(sourceSlice) !== normalizePhraseText(match.sourceText)
      ) {
        rejected.push(
          createPhraseRenderRejection(match, sentence.hash, "span-mismatch", {
            targetText: learningItem.targetText
          })
        );
        continue;
      }

      const isDueForReview =
        Boolean(learningItem.nextReviewAt) &&
        Date.parse(learningItem.nextReviewAt ?? "") <= Date.now();
      if (input.shouldActivatePhrase) {
        const curriculumDecision = input.shouldActivatePhrase({
          phraseId: match.phraseId,
          sourceText: match.sourceText,
          learningItem,
          confidence: match.confidence,
          sourceKind: match.sourceKind,
          category: match.category,
          renderUnitMinBand: match.renderUnitMinBand,
          isDueForReview
        });
        if (!curriculumDecision.eligible) {
          rejected.push(
            createPhraseRenderRejection(
              match,
              sentence.hash,
              `curriculum-${curriculumDecision.skipReason ?? "skip"}`,
              { targetText: learningItem.targetText }
            )
          );
          curriculumSkippedCount += 1;
          continue;
        }
      }

      candidates.push({
        phraseId: match.phraseId,
        itemId: learningItem.itemId,
        sourceKind: match.sourceKind,
        category: match.category,
        ruleId: match.ruleId,
        confidence: match.confidence,
        start,
        end,
        sourceText: match.sourceText,
        targetText: learningItem.targetText,
        sentence,
        isDueForReview
      });
    }
  }

  const selected: PhraseRenderCandidate[] = [];
  for (const candidate of candidates.sort(comparePhraseCandidates)) {
    if (
      selected.some((existing) =>
        spansOverlap(candidate.start, candidate.end, existing.start, existing.end)
      )
    ) {
      rejected.push(createPhraseRenderRejectionFromCandidate(candidate, "overlap"));
      continue;
    }

    selected.push(candidate);
    acceptedByStart.set(candidate.start, candidate);
  }

  return {
    acceptedByStart,
    rejected,
    curriculumSkippedCount
  };
}

function createPhraseRenderRejection(
  match: CachedPhraseMatch,
  sentenceHash: string,
  reason: string,
  options: { targetText?: string | null } = {}
): PhraseRenderRejection {
  return {
    phraseId: match.phraseId,
    reason,
    sourceText: match.sourceText,
    targetText: options.targetText ?? null,
    sourceKind: match.sourceKind,
    category: match.category,
    sentenceHash
  };
}

function createPhraseRenderRejectionFromCandidate(
  candidate: PhraseRenderCandidate,
  reason: string
): PhraseRenderRejection {
  return {
    phraseId: candidate.phraseId,
    reason,
    sourceText: candidate.sourceText,
    targetText: candidate.targetText,
    sourceKind: candidate.sourceKind,
    category: candidate.category,
    sentenceHash: candidate.sentence.hash
  };
}

function comparePhraseCandidates(
  left: PhraseRenderCandidate,
  right: PhraseRenderCandidate
): number {
  const leftLength = left.end - left.start;
  const rightLength = right.end - right.start;
  if (leftLength !== rightLength) {
    return rightLength - leftLength;
  }

  if (left.confidence !== right.confidence) {
    return right.confidence - left.confidence;
  }

  return left.start - right.start;
}

function spansOverlap(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number
): boolean {
  return leftStart < rightEnd && rightStart < leftEnd;
}

function normalizePhraseText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function hasUsablePhraseTarget(value: string): boolean {
  return value.trim().length > 0;
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
  lexemeId: string,
  vocabByLexemeId: Map<string, UserVocabEntry>
): VocabStatus {
  const entry = vocabByLexemeId.get(lexemeId);
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

function effectiveDiscoveryRate(
  baseRate: number,
  activationDecision: ActivationDecision | null
): number {
  const floor = activationDecision?.discoveryRateFloor;
  if (typeof floor !== "number" || !Number.isFinite(floor)) {
    return baseRate;
  }

  return Math.min(1, Math.max(baseRate, floor));
}

type TextWindow = {
  text: string;
  start: number;
  end: number;
};

function splitTextIntoProcessableWindows(input: string): TextWindow[] {
  if (input.length <= MAX_TEXT_NODE_LENGTH) {
    return [
      {
        text: input,
        start: 0,
        end: input.length
      }
    ];
  }

  const windows: TextWindow[] = [];
  let windowStart = 0;
  let lastSentenceBreak = 0;

  for (const match of input.matchAll(/[^.!?]+[.!?]?/g)) {
    const raw = match[0] ?? "";
    const end = (match.index ?? 0) + raw.length;

    if (end - windowStart > MAX_TEXT_NODE_LENGTH && lastSentenceBreak > windowStart) {
      windows.push(createTextWindow(input, windowStart, lastSentenceBreak));
      windowStart = lastSentenceBreak;
    }

    while (end - windowStart > MAX_TEXT_NODE_LENGTH) {
      const splitAt = findWindowBreak(input, windowStart, MAX_TEXT_NODE_LENGTH);
      windows.push(createTextWindow(input, windowStart, splitAt));
      windowStart = splitAt;
    }

    lastSentenceBreak = end;
  }

  if (windowStart < input.length) {
    windows.push(createTextWindow(input, windowStart, input.length));
  }

  return windows.filter((window) => window.text.length > 0);
}

function createTextWindow(input: string, start: number, end: number): TextWindow {
  return {
    text: input.slice(start, end),
    start,
    end
  };
}

function findWindowBreak(input: string, start: number, maxLength: number): number {
  const hardLimit = Math.min(start + maxLength, input.length);
  const preferredFloor = start + Math.floor(maxLength * 0.6);

  for (let index = hardLimit; index > preferredFloor; index -= 1) {
    if (/\s/.test(input.charAt(index))) {
      return index;
    }
  }

  return hardLimit;
}

function collectCandidatePhraseHints(
  candidates: readonly SentenceCandidateMetadata[]
): string[] {
  return [
    ...new Set(candidates.flatMap((candidate) => candidate.phraseHints))
  ];
}

function normalizeStatus(status: string): VocabStatus {
  if (status === "known" || status === "learning" || status === "ignored") {
    return status;
  }

  return "new";
}

function createWordEntryFromCachedDecision(
  decision: CachedWordRenderDecision | null
): WordRenderEntry | null {
  if (
    !decision ||
    decision.decision !== "inject" ||
    !decision.renderUnitId ||
    !decision.targetText ||
    !decision.candidatePos
  ) {
    return null;
  }

  return {
    lexemeId: decision.lexemeId,
    renderUnitId: decision.renderUnitId,
    renderUnitMinBand: decision.renderUnitMinBand ?? "",
    renderUnitMatchMode: "analyzer-pattern",
    normalizedSourceText:
      decision.normalizedSourceText ?? decision.normalizedText,
    targetText: decision.targetText,
    sourceLemma:
      decision.candidateLemma ??
      decision.normalizedSourceText ??
      decision.normalizedText,
    targetLemma: decision.targetText,
    pos: decision.candidatePos,
    frequencyRank: null,
    confidence: decision.confidence ?? 0.9,
    sourceLanguage: "en",
    targetLanguage: "es",
    sourceDataset: "render-units"
  };
}

function findCachedWordRenderDecision(input: {
  decisionsBySentenceHash?: Map<string, CachedWordRenderDecision[]>;
  sentenceHash: string;
  sourceToken: string;
  decision: "inject" | "skip";
  lexemeId?: string;
  renderUnitId?: string;
}): CachedWordRenderDecision | null {
  const decisions = input.decisionsBySentenceHash?.get(input.sentenceHash);
  if (!decisions || decisions.length === 0) {
    return null;
  }

  const normalizedSourceToken = normalizeToken(input.sourceToken);
  return (
    decisions.find((decision) => {
      if (decision.decision !== input.decision) {
        return false;
      }

      if (input.lexemeId && decision.lexemeId !== input.lexemeId) {
        return false;
      }

      if (
        input.renderUnitId &&
        decision.renderUnitId &&
        decision.renderUnitId !== input.renderUnitId
      ) {
        return false;
      }

      return normalizeToken(decision.normalizedText) === normalizedSourceToken;
    }) ?? null
  );
}

function findCachedSkipDecision(input: {
  decisionsBySentenceHash?: Map<string, CachedWordRenderDecision[]>;
  sentenceHash: string;
  lexemeId: string;
  renderUnitId?: string;
  sourceToken: string;
}): CachedWordRenderDecision | null {
  return findCachedWordRenderDecision({
    ...input,
    decision: "skip"
  });
}

function escapeSelector(value: string): string {
  return globalThis.CSS?.escape
    ? globalThis.CSS.escape(value)
    : value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
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
    contextSkippedCount: 0,
    phraseInjectedCount: 0,
    phraseRejectedCount: 0,
    curriculumSkippedWordCount: 0,
    curriculumSkippedPhraseCount: 0,
    sentenceCandidates: [],
    unrenderedPhraseRejections: []
  };
}
