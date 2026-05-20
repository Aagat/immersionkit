import {
  DEFAULT_SOURCE_LANGUAGE,
  DEFAULT_TARGET_LANGUAGE,
  explainCognatePatternMatch,
  splitTextIntoWindows
} from "@immersionkit/shared";
import type {
  LearningItem,
  SupportedSourceLanguage,
  SupportedTargetLanguage,
  TextWindow,
  UserVocabEntry,
  VocabStatus
} from "@immersionkit/shared";
import type { WordRenderEntry } from "../render-units/render-units";
import type { AnalyzerPatternWordRenderIndex } from "./word-render-index";
import { DIAGNOSTICS_ENABLED } from "../build-profile";

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
import {
  type CachedPhraseMatch,
  type CachedWordRenderDecision,
  type RuntimeAnalysisContext
} from "./storage";
import { preserveWordCasing, segmentText } from "./tokenize";
import {
  planTextReplacements,
  type ActivationDecision,
  type PhraseActivationInput,
  type PhraseRenderRejection,
  type PhraseReplacementSpan,
  type ReplacementPlan,
  type WordActivationInput,
  type WordReplacementSpan
} from "./replacement-planner";
import type { DebugDecisionSink } from "./debug-trace-store";

export type ProcessTextNodeContext = {
  discoveryRate: number;
  samplingSeed: string;
  createNodeId: () => string;
  sourceLanguage?: SupportedSourceLanguage;
  targetLanguage?: SupportedTargetLanguage;
  wordRenderIndex: Map<string, WordRenderEntry>;
  analyzerPatternWordRenderIndex?: AnalyzerPatternWordRenderIndex;
  vocabByLexemeId: Map<string, UserVocabEntry>;
  isKnownWordForScoring: (word: string) => boolean;
  isDueForReview?: (lexemeId: string) => boolean;
  analysisContext?: RuntimeAnalysisContext;
  cachedWordRenderDecisions?: Map<string, CachedWordRenderDecision[]>;
  cachedPhraseMatchesBySentenceHash?: Map<string, CachedPhraseMatch[]>;
  sentenceHintPhrases?: readonly string[];
  learningItemsByUnitRefId?: Map<string, LearningItem>;
  shouldActivateWord?: (input: WordActivationInput) => ActivationDecision;
  shouldActivatePhrase?: (input: PhraseActivationInput) => ActivationDecision;
  debugSink?: DebugDecisionSink;
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

export type {
  ActivationDecision,
  WordActivationInput,
  PhraseActivationInput,
  PhraseRenderRejection
} from "./replacement-planner";

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

  const windows = splitTextIntoWindows({
    text: sourceText,
    maxLength: MAX_TEXT_NODE_LENGTH
  });
  if (windows.length > 1) {
    return processWindowedTextNode(node, context, windows);
  }

  const rendered = renderTextWindow({
    sourceText,
    context,
    offsetBase: 0,
    windowIndex: 0
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

  for (const [windowIndex, window] of windows.entries()) {
    const rendered = renderTextWindow({
      sourceText: window.text,
      context,
      offsetBase: window.start,
      windowIndex
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
  windowIndex: number;
}): {
  replaced: boolean;
  node: Node;
  result: ProcessTextNodeResult;
} {
  const { sourceText, context, offsetBase, windowIndex } = input;
  if (segmentText(sourceText).length === 0) {
    return {
      replaced: false,
      node: document.createTextNode(sourceText),
      result: emptyResult()
    };
  }

  const nodeId = context.createNodeId();
  const plan = planTextReplacements({
    sourceText,
    context: {
      ...context,
      nodeId,
      sourceLanguage: context.sourceLanguage ?? DEFAULT_SOURCE_LANGUAGE,
      targetLanguage: context.targetLanguage ?? DEFAULT_TARGET_LANGUAGE
    },
    offsetBase
  });
  recordDebugNodeTrace(context.debugSink, plan, {
    sourceText,
    offsetBase,
    windowIndex,
    replaced: plan.spans.length > 0
  });

  if (plan.spans.length === 0) {
    return {
      replaced: false,
      node: document.createTextNode(sourceText),
      result: {
        ...emptyResult(),
        contextSkippedCount: plan.diagnostics.contextSkippedCount,
        phraseRejectedCount: plan.diagnostics.phraseRejectedCount,
        curriculumSkippedWordCount: plan.diagnostics.curriculumSkippedWordCount,
        curriculumSkippedPhraseCount: plan.diagnostics.curriculumSkippedPhraseCount,
        sentenceCandidates: plan.sentenceCandidates,
        unrenderedPhraseRejections: plan.phraseRejections
      }
    };
  }

  const wrapper = renderReplacementPlan(plan);
  const phraseHints = collectCandidatePhraseHints(plan.sentenceCandidates);
  if (phraseHints.length > 0) {
    setDiagnosticAttribute(wrapper, "data-ik-render-layer", "word phrase-candidate");
    setDiagnosticAttribute(wrapper, "data-ik-phrase-hints", phraseHints.join("|"));
  }

  if (plan.diagnostics.phraseInjectedCount > 0) {
    setDiagnosticAttribute(
      wrapper,
      "data-ik-render-layer",
      phraseHints.length > 0 ? "word phrase phrase-candidate" : "word phrase"
    );
    setDiagnosticAttribute(
      wrapper,
      "data-ik-phrase-selected",
      plan.spans
        .flatMap((span) => (span.kind === "phrase" ? [span.phraseId] : []))
        .join("|")
    );
  }

  if (plan.phraseRejections.length > 0) {
    setDiagnosticAttribute(
      wrapper,
      "data-ik-phrase-rejection-details",
      JSON.stringify(plan.phraseRejections.slice(0, 8))
    );
  }

  if (plan.sentenceCandidates.length > 0) {
    setDiagnosticAttribute(
      wrapper,
      "data-ik-sentence-candidate-hashes",
      plan.sentenceCandidates.map((candidate) => candidate.sentenceHash).join("|")
    );
  }

  return {
    replaced: true,
    node: wrapper,
    result: {
      replaced: true,
      injectedCount: plan.diagnostics.injectedCount,
      knownCount: plan.diagnostics.knownCount,
      discoveryCount: plan.diagnostics.discoveryCount,
      contextSkippedCount: plan.diagnostics.contextSkippedCount,
      phraseInjectedCount: plan.diagnostics.phraseInjectedCount,
      phraseRejectedCount: plan.diagnostics.phraseRejectedCount,
      curriculumSkippedWordCount: plan.diagnostics.curriculumSkippedWordCount,
      curriculumSkippedPhraseCount: plan.diagnostics.curriculumSkippedPhraseCount,
      sentenceCandidates: plan.sentenceCandidates,
      unrenderedPhraseRejections: []
    }
  };
}

function recordDebugNodeTrace(
  debugSink: DebugDecisionSink | undefined,
  plan: ReplacementPlan,
  input: {
    sourceText: string;
    offsetBase: number;
    windowIndex: number;
    replaced: boolean;
  }
): void {
  debugSink?.recordTextNodeTrace({
    nodeId: plan.nodeId,
    sourcePreview: input.sourceText,
    sourceLength: input.sourceText.length,
    offsetBase: input.offsetBase,
    windowIndex: input.windowIndex,
    replaced: input.replaced,
    injectedCount: plan.diagnostics.injectedCount,
    phraseInjectedCount: plan.diagnostics.phraseInjectedCount,
    phraseRejectedCount: plan.diagnostics.phraseRejectedCount,
    contextSkippedCount: plan.diagnostics.contextSkippedCount,
    curriculumSkippedWordCount: plan.diagnostics.curriculumSkippedWordCount,
    curriculumSkippedPhraseCount: plan.diagnostics.curriculumSkippedPhraseCount,
    sentenceHashes: plan.sentenceHashes,
    tokenIds: plan.spans.map((span) => span.tokenId),
    phraseTokenIds: plan.spans.flatMap((span) =>
      span.kind === "phrase" ? [span.tokenId] : []
    )
  });
}

function renderReplacementPlan(plan: {
  sourceText: string;
  nodeId: string;
  spans: readonly (WordReplacementSpan | PhraseReplacementSpan)[];
}): HTMLElement {
  const wrapper = document.createElement("span");
  let cursor = 0;

  wrapper.className = "ik-node";
  wrapper.setAttribute(IMMERSIONKIT_NODE_ATTRIBUTE, plan.nodeId);
  wrapper.setAttribute(
    IMMERSIONKIT_ORIGINAL_TEXT_ATTRIBUTE,
    encodeOriginalText(plan.sourceText)
  );
  setDiagnosticAttribute(wrapper, "data-ik-render-layer", "word");

  for (const span of plan.spans) {
    if (cursor < span.start) {
      wrapper.append(plan.sourceText.slice(cursor, span.start));
    }

    if (span.kind === "word") {
      wrapper.append(createTokenElement(span));
    } else {
      wrapper.append(createPhraseElement(span));
    }

    cursor = span.end;
  }

  if (cursor < plan.sourceText.length) {
    wrapper.append(plan.sourceText.slice(cursor));
  }

  return wrapper;
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
  const sourceLanguage =
    tokenElement.getAttribute("data-ik-source-language") ?? DEFAULT_SOURCE_LANGUAGE;
  const targetLanguage =
    tokenElement.getAttribute("data-ik-target-language") ?? DEFAULT_TARGET_LANGUAGE;
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
    sourceLanguage,
    targetLanguage,
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
    exampleSentenceNative: tokenElement.getAttribute("data-ik-example-sentence-native"),
    curriculumReason: tokenElement.getAttribute("data-ik-curriculum-reason")
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
  const sourceLanguage =
    tokenElement.getAttribute("data-ik-source-language") ?? DEFAULT_SOURCE_LANGUAGE;
  const targetLanguage =
    tokenElement.getAttribute("data-ik-target-language") ?? DEFAULT_TARGET_LANGUAGE;

  if (
    !tokenId ||
    !nodeId ||
    !sourceText ||
    !targetText ||
    !phraseId ||
    !itemId
  ) {
    return null;
  }

  const rawConfidence = tokenElement.getAttribute("data-ik-phrase-confidence");
  const confidence = rawConfidence ? Number.parseFloat(rawConfidence) : Number.NaN;

  return {
    tokenId,
    nodeId,
    sourceLanguage,
    targetLanguage,
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
    sentenceHash: tokenElement.getAttribute("data-ik-sentence-hash"),
    curriculumReason: tokenElement.getAttribute("data-ik-curriculum-reason")
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
  activeBandId?: string | null;
  activationReason?: string | null;
}): HTMLSpanElement {
  const element = document.createElement("span");

  element.className = "ik-ui-mark ik-ui-mark--word";
  element.textContent = input.targetToken;
  element.tabIndex = 0;
  element.setAttribute("role", "button");
  element.setAttribute(
    "data-ik-source-language",
    input.wordEntry.sourceLanguage ?? DEFAULT_SOURCE_LANGUAGE
  );
  element.setAttribute(
    "data-ik-target-language",
    input.wordEntry.targetLanguage ?? DEFAULT_TARGET_LANGUAGE
  );
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
  setDiagnosticAttribute(element, "data-ik-context-decision", "inject");
  setDiagnosticAttribute(
    element,
    "data-ik-due-status",
    input.isDueForReview ? "due" : "not-due"
  );
  setDiagnosticAttribute(
    element,
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
    "data-ik-curriculum-reason",
    explainWordCurriculumReason(input)
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
  sourceLanguage: SupportedSourceLanguage;
  targetLanguage: SupportedTargetLanguage;
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
  element.setAttribute("data-ik-source-language", input.sourceLanguage);
  element.setAttribute("data-ik-target-language", input.targetLanguage);
  element.setAttribute("data-ik-unit-kind", "phrase");
  element.setAttribute("data-kind", "phrase");
  element.setAttribute("data-status", input.isDueForReview ? "learning" : "new");
  element.setAttribute(IMMERSIONKIT_TOKEN_ATTRIBUTE, input.tokenId);
  element.setAttribute(IMMERSIONKIT_NODE_ATTRIBUTE, input.nodeId);
  element.setAttribute("data-ik-source-token", input.sourceText);
  element.setAttribute("data-ik-target-token", input.targetText);
  element.setAttribute("data-ik-phrase-id", input.phraseId);
  element.setAttribute("data-ik-item-id", input.itemId);
  setDiagnosticAttribute(element, "data-ik-phrase-category", input.category);
  setDiagnosticAttribute(element, "data-ik-phrase-source-kind", input.sourceKind);
  setDiagnosticAttribute(element, "data-ik-phrase-rule-id", input.ruleId);
  setDiagnosticAttribute(
    element,
    "data-ik-phrase-confidence",
    input.confidence.toFixed(3)
  );
  setDiagnosticAttribute(element, "data-ik-context-decision", "inject");
  setDiagnosticAttribute(
    element,
    "data-ik-due-status",
    input.isDueForReview ? "due" : "not-due"
  );
  setDiagnosticAttribute(
    element,
    "data-ik-scheduler-reason",
    input.isDueForReview ? "phrase-due-review" : "phrase-learning-item"
  );
  element.setAttribute(
    "data-ik-curriculum-reason",
    explainPhraseCurriculumReason(input)
  );
  element.setAttribute("data-ik-sentence", truncateSentenceMetadata(input.sentence.text));
  element.setAttribute("data-ik-sentence-hash", input.sentence.hash);
  element.setAttribute(
    "aria-label",
    `${input.sourceText} translated to ${input.targetText}`
  );

  return element;
}

function explainWordCurriculumReason(input: {
  sourceToken: string;
  targetToken: string;
  status: VocabStatus;
  wordKind: InjectedWordKind;
  isDueForReview: boolean;
  activeBandId?: string | null;
  activationReason?: string | null;
}): string {
  if (input.isDueForReview) {
    return "This word is due for review and still passed the current reading safety checks.";
  }

  if (input.status === "known") {
    return "This word is comfortable enough to appear while you read.";
  }

  const patternReason = explainWordPatternReason(
    input.sourceToken,
    input.targetToken,
    input.activeBandId
  );
  if (patternReason) {
    return patternReason;
  }

  if (input.activationReason === "beginner-cognate") {
    return "This is a familiar Spanish-English pair that fits your current focus.";
  }

  if (input.wordKind === "discovery") {
    return "This word fits your current reading band and appeared in a safe local context.";
  }

  return "This item fits your current reading path.";
}

function explainWordPatternReason(
  sourceToken: string,
  targetToken: string,
  activeBandId: string | null | undefined
): string | null {
  return explainCognatePatternMatch({
    source: sourceToken,
    target: targetToken,
    activeBandId
  });
}

function explainPhraseCurriculumReason(input: {
  sourceText: string;
  category: string;
  sourceKind: string;
  isDueForReview: boolean;
}): string {
  if (input.isDueForReview) {
    return "This phrase is due for review and still fits the current page.";
  }

  if (input.category === "grammar-carrier") {
    return "This phrase carries a grammar pattern that is easier to learn as a chunk.";
  }

  if (input.sourceKind === "fixed-phrase") {
    return "This phrase is learned as a chunk because it does not map word-for-word cleanly.";
  }

  return "This phrase fits your current phrase focus and is easier to read as a chunk.";
}

function setDiagnosticAttribute(
  element: HTMLElement,
  name: string,
  value: string
): void {
  if (DIAGNOSTICS_ENABLED) {
    element.setAttribute(name, value);
  }
}

function toUiTokenStatus(status: VocabStatus): "new" | "learning" | "known" | "muted" {
  if (status === "ignored") {
    return "muted";
  }

  return status;
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
