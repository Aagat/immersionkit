import type {
  ExtensionOptionsProps,
  ExtensionPopupProps,
  PhraseHelpPopoverProps,
  SentenceHelpPopoverProps,
  WordHelpPopoverProps
} from "../index";

const noop = () => undefined;

const popupMetrics: NonNullable<ExtensionPopupProps["metrics"]> = [
  { label: "reading band", value: "1B", icon: "band" },
  { label: "comfortable", value: 18, icon: "check" },
  { label: "practice", value: 9, icon: "spark" }
];

const popupLearningStats: NonNullable<ExtensionPopupProps["learningStats"]> = {
  comfortable: 18,
  practice: 9,
  newCount: 12,
  ignored: 2,
  total: 41
};

const popupLearningDays: NonNullable<ExtensionPopupProps["learningDays"]> = [
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
  onOpenSettings: noop
};

const optionsStats: NonNullable<ExtensionOptionsProps["stats"]> = {
  comfortable: 18,
  practice: 9,
  newCount: 12,
  total: 41
};

const checkpoint: NonNullable<ExtensionOptionsProps["checkpoint"]> = {
  currentBand: "Level 1B",
  nextBand: "Level 1C",
  progressValue: 68,
  progressLabel: "4 reading evidence items left",
  description:
    "Local reading evidence is building across words, phrases, and sentence assists.",
  canWiden: false,
  onWiden: noop
};

const currentFocus: NonNullable<ExtensionOptionsProps["currentFocus"]> = {
  levelLabel: "False beginner",
  bandLabel: "Level 1B",
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

const learningPath: NonNullable<ExtensionOptionsProps["learningPath"]> = [
  {
    levelId: "level-1",
    levelLabel: "Foundations",
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
        bandLabel: "Level 1A",
        learnerTitle: "First Spanish on the page",
        learnerSummary:
          "Concrete everyday words, familiar-looking pairs, and a few useful short phrases.",
        active: false,
        unlocked: true
      },
      {
        bandId: "level-1b",
        bandLabel: "Level 1B",
        learnerTitle: "Time, place, and familiar contexts",
        learnerSummary:
          "Places, days, time words, family, weather, and simple time/place phrases.",
        active: true,
        unlocked: true
      },
      {
        bandId: "level-1c",
        bandLabel: "Level 1C",
        learnerTitle: "Foundation review before Level 2",
        learnerSummary:
          "Consolidate simple vocabulary and add easy word-family patterns.",
        active: false,
        unlocked: false
      }
    ]
  },
  {
    levelId: "level-2",
    levelLabel: "Everyday Patterns",
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
        bandLabel: "Level 2A",
        learnerTitle: "A1 to A2 reading support",
        learnerSummary:
          "Routines, events, planning, comparison, and community words.",
        active: false,
        unlocked: false
      },
      {
        bandId: "level-2b",
        bandLabel: "Level 2B",
        learnerTitle: "Everyday obligations and plans",
        learnerSummary:
          "Going to, have to, should, and common routine phrases.",
        active: false,
        unlocked: false
      },
      {
        bandId: "level-2c",
        bandLabel: "Level 2C",
        learnerTitle: "Everyday pattern checkpoint",
        learnerSummary:
          "Review time anchors, comparison, and everyday sentence patterns.",
        active: false,
        unlocked: false
      }
    ]
  },
  {
    levelId: "level-3",
    levelLabel: "Narrative and Description",
    active: false,
    unlocked: false,
    stageSummary: "A2 to early B1 reading support.",
    vocabularySummary: "Narrative, cause/effect, time sequence, and descriptive vocabulary.",
    phraseSummary: "Connectors, purpose chunks, and narrative phrases.",
    grammarSummary: "When, because, used to, purpose, and progressive recognition.",
    sentenceSummary: "Short connected contexts with light subordination.",
    checkpointSummary: "Connected sentence meaning.",
    bands: [
      {
        bandId: "level-3a",
        bandLabel: "Level 3A",
        learnerTitle: "Narrative links",
        learnerSummary:
          "Sequence, cause/effect, and short connected descriptions.",
        active: false,
        unlocked: false
      },
      {
        bandId: "level-3b",
        bandLabel: "Level 3B",
        learnerTitle: "Past habits and descriptions",
        learnerSummary:
          "Used to, when, because, and light descriptive clauses.",
        active: false,
        unlocked: false
      },
      {
        bandId: "level-3c",
        bandLabel: "Level 3C",
        learnerTitle: "Narrative checkpoint",
        learnerSummary:
          "Review connected sentence meaning before wider explanation prose.",
        active: false,
        unlocked: false
      }
    ]
  },
  {
    levelId: "level-4",
    levelLabel: "Connected Expression",
    active: false,
    unlocked: false,
    stageSummary: "B1 to B2 reading support.",
    vocabularySummary: "Explanation, opinion, evidence, process, and abstract vocabulary.",
    phraseSummary: "Argument and explanation markers.",
    grammarSummary: "Have been, present perfect, passive basics, conditionals, and concession.",
    sentenceSummary: "Multi-clause explanation prose with overload controls.",
    checkpointSummary: "Richer native prose and abstract reasoning.",
    bands: [
      {
        bandId: "level-4a",
        bandLabel: "Level 4A",
        learnerTitle: "Explanation prose",
        learnerSummary:
          "Opinion, evidence, process, and abstract vocabulary.",
        active: false,
        unlocked: false
      },
      {
        bandId: "level-4b",
        bandLabel: "Level 4B",
        learnerTitle: "Connected expression checkpoint",
        learnerSummary:
          "Present perfect, passive basics, conditionals, and concession.",
        active: false,
        unlocked: false
      }
    ]
  },
  {
    levelId: "level-5",
    levelLabel: "Broad Native Reading",
    active: false,
    unlocked: false,
    stageSummary: "B2+ reading support.",
    vocabularySummary: "Broad domain and specialized vocabulary.",
    phraseSummary: "Discourse markers and dense native chunks.",
    grammarSummary: "Embedded clauses, reported speech, advanced conditionals, and adaptive review.",
    sentenceSummary: "Longer native sentences when ranking keeps them readable.",
    checkpointSummary: "Adaptive review.",
    bands: [
      {
        bandId: "level-5a",
        bandLabel: "Level 5A",
        learnerTitle: "Broad native contexts",
        learnerSummary:
          "Specialized vocabulary and dense native chunks.",
        active: false,
        unlocked: false
      },
      {
        bandId: "level-5b",
        bandLabel: "Level 5B",
        learnerTitle: "Broad native reading",
        learnerSummary:
          "Adaptive review across long native sentences and weak points.",
        active: false,
        unlocked: false
      }
    ]
  }
];

const diagnostics: NonNullable<ExtensionOptionsProps["advancedDiagnostics"]> = {
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
  isReadingLevelPresetActive: true,
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
