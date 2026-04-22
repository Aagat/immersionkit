export type PhraseSourceKind = "fixed-phrase" | "pattern-match" | "chunk";

export type PhraseCategory =
  | "fixed-idiom"
  | "function-phrase"
  | "grammar-carrier"
  | "adjective-noun"
  | "noun-chunk";

export type PhraseTokenAnnotation = {
  surface: string;
  pos: string;
  normalized?: string;
  lemma?: string;
};

export type PhraseChunkAnnotation = {
  kind: "noun-chunk" | "verb-chunk" | "other";
  startToken: number;
  endToken: number;
};

export type PhraseGoldExpectation = {
  id: string;
  category: PhraseCategory;
  sourceKind: PhraseSourceKind;
  startToken: number;
  endToken: number;
  normalizedSourceText: string;
};

export type PhraseGoldCase = {
  id: string;
  sourceText: string;
  tokens: PhraseTokenAnnotation[];
  chunks?: PhraseChunkAnnotation[];
  expectedPhrases: PhraseGoldExpectation[];
  notes?: string;
};

export type PhraseGoldCorpus = {
  version: string;
  description: string;
  cases: PhraseGoldCase[];
};

export type PhraseToken = {
  index: number;
  surface: string;
  normalized: string;
  lemma: string;
  pos: string;
  startChar: number;
  endChar: number;
};

export type PhraseCandidateSpan = {
  startToken: number;
  endToken: number;
  startChar: number;
  endChar: number;
  tokenLength: number;
};

export type PhraseCandidate = {
  sourceKind: PhraseSourceKind;
  category: PhraseCategory;
  lane: "fixed" | "grammar-chunk";
  ruleId: string;
  sourceText: string;
  normalizedSourceText: string;
  canonicalPhraseKey: string;
  confidence: number;
  ruleStrength: number;
  span: PhraseCandidateSpan;
};

export type PhraseDetectionResult = {
  allCandidates: PhraseCandidate[];
  selectedCandidates: PhraseCandidate[];
};

export type PhraseCaseEvaluation = {
  caseId: string;
  sourceText: string;
  detected: PhraseCandidate[];
  expected: PhraseGoldExpectation[];
  truePositives: PhraseCandidate[];
  falsePositives: PhraseCandidate[];
  falseNegatives: PhraseGoldExpectation[];
};

export type PhraseCategoryMetrics = {
  category: PhraseCategory;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
};

export type PhraseErrorExample =
  | {
      type: "false-positive";
      category: PhraseCategory;
      caseId: string;
      sourceText: string;
      candidate: PhraseCandidate;
    }
  | {
      type: "false-negative";
      category: PhraseCategory;
      caseId: string;
      sourceText: string;
      expected: PhraseGoldExpectation;
    };

export type PhraseEvaluationSummary = {
  corpusVersion: string;
  categoryMetrics: PhraseCategoryMetrics[];
  overall: {
    truePositives: number;
    falsePositives: number;
    falseNegatives: number;
    precision: number;
    recall: number;
  };
  caseResults: PhraseCaseEvaluation[];
  errors: PhraseErrorExample[];
};
