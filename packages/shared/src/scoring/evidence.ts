export const CONTENT_EVIDENCE_POLICY = {
  qualifiedDwellMs: 1_500,
  grammarDetailDwellMs: 2_500,
  qualifiedIntersectionRatio: 0.6,
  evidenceDedupeWindowMs: 5 * 60 * 1000,
  viewportDwellConfidence: 0.72,
  grammarDetailMinimumConfidence: 0.6,
  grammarDetailMaximumConfidence: 0.92
} as const;
