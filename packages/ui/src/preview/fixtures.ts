import type {
  ExtensionOptionsProps,
  ExtensionPopupProps,
  PhraseHelpPopoverProps,
  SentenceHelpPopoverProps,
  WordHelpPopoverProps
} from "../index";

export const noop = () => undefined;

export const popupMetrics: NonNullable<ExtensionPopupProps["metrics"]> = [
  { label: "reading band", value: "1B", icon: "band" },
  { label: "comfortable", value: 18, icon: "check" },
  { label: "practice", value: 9, icon: "spark" }
];

export const popupLearningStats: NonNullable<ExtensionPopupProps["learningStats"]> = {
  comfortable: 18,
  practice: 9,
  newCount: 12,
  ignored: 2,
  total: 41
};

export const popupLearningDays: NonNullable<ExtensionPopupProps["learningDays"]> = [
  { label: "Mon", comfortable: 3, practice: 2, newCount: 1, total: 6 },
  { label: "Tue", comfortable: 4, practice: 1, newCount: 3, total: 8 },
  { label: "Wed", comfortable: 2, practice: 4, newCount: 2, total: 8 },
  { label: "Thu", comfortable: 5, practice: 2, newCount: 1, total: 8 },
  { label: "Fri", comfortable: 4, practice: 3, newCount: 4, total: 11 }
];

export const supportedPopupProps: ExtensionPopupProps = {
  state: "supported",
  title: "Small routines for a slower reading day",
  url: "localnotes.example/routines",
  bandTitle: "Reading band 1B",
  bandSubtitle: "Gentle pace. Words + phrases.",
  progressValue: 62,
  progressLabel: "62%",
  progressDetail: "3 local reading signals left before the next band.",
  metrics: popupMetrics,
  learningStats: popupLearningStats,
  learningDays: popupLearningDays,
  onSiteToggle: noop,
  onOpenSettings: noop,
  onDismissIntro: noop
};

export const optionsStats: NonNullable<ExtensionOptionsProps["stats"]> = {
  comfortable: 18,
  practice: 9,
  newCount: 12,
  total: 41
};

export const checkpoint: NonNullable<ExtensionOptionsProps["checkpoint"]> = {
  currentBand: "Band 1B",
  nextBand: "Band 2A",
  progressValue: 68,
  progressLabel: "68%",
  description:
    "Local reading evidence is building across words, phrases, and sentence assists.",
  canWiden: false,
  onWiden: noop
};

export const currentFocus: NonNullable<ExtensionOptionsProps["currentFocus"]> = {
  levelLabel: "False beginner",
  bandLabel: "Band 1B",
  learnerTitle: "Everyday reading support",
  shortGoal: "Keep pages readable while adding reliable Spanish contact.",
  wordFocusLabels: ["daily nouns", "stable adjectives", "common adverbs"],
  wordExampleLabels: ["city", "important", "near"],
  allowedPartOfSpeechPolicy: "Nouns, adjectives, and adverbs only.",
  wordPatternLabels: ["-tion -> -ción cognates", "high-confidence lookalikes"],
  phraseFocusExamples: ["right now", "at least", "as soon as"],
  grammarFocusLabels: ["adjective order", "present-tense descriptions"],
  sentenceFocusLabel: "Short explanatory notes when sentence help is enabled.",
  nextFocusPreview: "More phrase chunks and broader reading contexts."
};

export const learningPath: NonNullable<ExtensionOptionsProps["learningPath"]> = [
  {
    levelId: "level-1",
    levelLabel: "Level 1",
    active: true,
    unlocked: true,
    stageSummary: "Foundation reading",
    vocabularySummary: "High-confidence everyday words.",
    phraseSummary: "Fixed phrases and safe reusable chunks.",
    grammarSummary: "Simple present-tense patterns.",
    sentenceSummary: "Short selected sentence notes.",
    checkpointSummary: "Local reading-band widening.",
    bands: [
      {
        bandId: "level-1a",
        bandLabel: "1A",
        learnerTitle: "First contact",
        learnerSummary: "Safest words and fixed phrases.",
        active: false,
        unlocked: true
      },
      {
        bandId: "level-1b",
        bandLabel: "1B",
        learnerTitle: "Daily reading",
        learnerSummary: "More everyday nouns and reusable phrases.",
        active: true,
        unlocked: true
      }
    ]
  },
  {
    levelId: "level-2",
    levelLabel: "Level 2",
    active: false,
    unlocked: false,
    stageSummary: "Broader contexts",
    vocabularySummary: "More domains and phrase-rich sentences.",
    phraseSummary: "Chunk-safe phrase targets.",
    grammarSummary: "Intermediate source-side markers.",
    sentenceSummary: "Longer but still selected notes.",
    checkpointSummary: "Deliberate local unlock.",
    bands: [
      {
        bandId: "level-2a",
        bandLabel: "2A",
        learnerTitle: "Broader pages",
        learnerSummary: "More content domains after local evidence.",
        active: false,
        unlocked: false
      }
    ]
  }
];

export const diagnostics: NonNullable<ExtensionOptionsProps["advancedDiagnostics"]> = {
  buildProfile: "diagnostic",
  diagnosticsEnabled: true,
  activePageMessage: "Supported page with current sentence cache.",
  activePageUrl: "https://localnotes.example/routines",
  activePageUpdatedAt: "2026-05-18T15:45:00.000Z",
  activePageMetrics: [
    { label: "Injected words", value: 16 },
    { label: "Injected phrases", value: 4 },
    { label: "Sentence notes", value: 1 }
  ],
  curriculumSummary: "Active band level-1b, phrase inventory gate enabled.",
  progressionSummary: "3 public signals left before widening.",
  storageMetrics: [
    { label: "Learning items", value: 41 },
    { label: "Phrase registry", value: 12 },
    { label: "Sentence cache", value: 8 }
  ]
};

export const baseOptionsProps: ExtensionOptionsProps = {
  stats: optionsStats,
  checkpoint,
  currentFocus,
  learningPath,
  siteSummary: "One site paused, four saved site choices.",
  pausedSiteCount: 1,
  savedSiteCount: 4,
  discoveryRatePercent: 8,
  readingLevel: "False beginner",
  advancedDiagnostics: diagnostics,
  exactActiveBandId: "level-1b",
  bandOptions: [
    { id: "level-1a", label: "Level 1A" },
    { id: "level-1b", label: "Level 1B" },
    { id: "level-2a", label: "Level 2A" }
  ],
  onSave: noop,
  onReload: noop,
  onDismissIntro: noop,
  onDiscoveryRateChange: noop,
  onReadingLevelChange: noop,
  onExactBandChange: noop,
  onSentenceHelpChange: noop,
  onProviderChange: noop,
  onApiKeyChange: noop,
  onToggleApiKeyVisibility: noop,
  onClearApiKey: noop
};

export const wordPopoverProps: WordHelpPopoverProps = {
  sourceText: "reading",
  targetText: "lectura",
  status: "learning",
  rationale:
    "This word fits your current reading band and appeared in a safe local context.",
  nativeExample: "Una lectura corta en un cafe puede reiniciar el dia.",
  englishExample: "A short reading in a cafe can reset the day.",
  onClose: noop,
  onStatusAction: noop
};

export const phrasePopoverProps: PhraseHelpPopoverProps = {
  sourceText: "at least",
  targetText: "al menos",
  rationale: "You may see this again when it fits the page.",
  sentence: "The city has at least one small family house near the water.",
  onClose: noop
};

export const sentencePopoverProps: SentenceHelpPopoverProps = {
  sourceText: "The new city is important and has at least one small family house.",
  translatedText:
    "La ciudad nueva e importante tiene al menos una pequena casa familiar.",
  learningNote: {
    summary: "Spanish adjective order can change emphasis.",
    grammarFocus:
      "Spanish adjective order can change emphasis, so city/new/important does not map one-for-one."
  },
  grammarCards: [
    {
      featureKey: "grammar:adjective-order",
      sourceText: "new city is important",
      title: "Adjective order",
      explanation:
        "Spanish usually places many descriptive adjectives after the noun.",
      sourcePatternLabel: "adjective + noun",
      targetPatternLabel: "noun + adjective",
      exampleMapping: "new city -> ciudad nueva",
      curriculumReason: "This pattern is useful in short article sentences.",
      curriculumStatus: "active"
    }
  ],
  onClose: noop,
  onAction: noop
};
