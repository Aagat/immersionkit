export const USER_DATA_KEYS = {
  settings: "settings",
  siteSettings: "site-settings",
  providerOpenAiApiKey: "provider-openai-api-key",
  curriculumConfig: "curriculum-config",
  learningProfile: "learning-profile",
  curriculumProgressionDiagnostics: "curriculum-progression-diagnostics",
  firstRunIntro: "first-run-intro-visible"
} as const;

export type UserDataKey = (typeof USER_DATA_KEYS)[keyof typeof USER_DATA_KEYS];
