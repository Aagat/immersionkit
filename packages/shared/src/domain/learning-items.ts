import {
  LEARNING_UNIT_TYPES,
  type LearningUnitType
} from "./models";

const LEARNING_UNIT_TYPE_SET: ReadonlySet<string> = new Set(LEARNING_UNIT_TYPES);
const LEARNING_ITEM_UNIT_REF_ID_PATTERN = /^[a-zA-Z0-9:_-]+$/;

export type ParsedLearningItemId = {
  itemId: string;
  unitType: LearningUnitType;
  unitRefId: string;
};

export function buildLearningItemId(
  unitType: LearningUnitType,
  unitRefId: string
): string {
  return `${unitType}:${unitRefId.trim()}`;
}

export function parseLearningItemId(itemId: string): ParsedLearningItemId | null {
  const trimmedItemId = itemId.trim();
  const separatorIndex = trimmedItemId.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex >= trimmedItemId.length - 1) {
    return null;
  }

  const unitType = trimmedItemId.slice(0, separatorIndex);
  const unitRefId = trimmedItemId.slice(separatorIndex + 1);
  if (
    !LEARNING_UNIT_TYPE_SET.has(unitType) ||
    !LEARNING_ITEM_UNIT_REF_ID_PATTERN.test(unitRefId)
  ) {
    return null;
  }

  return {
    itemId: trimmedItemId,
    unitType: unitType as LearningUnitType,
    unitRefId
  };
}

export function isSupportedLearningItemId(itemId: string): boolean {
  return parseLearningItemId(itemId) !== null;
}
