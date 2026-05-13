import { STORAGE_SCHEMA } from "../storage/storage-schema";

export const USER_DATA_KEYS = STORAGE_SCHEMA.userDataKeys;

export type UserDataKey = (typeof USER_DATA_KEYS)[keyof typeof USER_DATA_KEYS];
