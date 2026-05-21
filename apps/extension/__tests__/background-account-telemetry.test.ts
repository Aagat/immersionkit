import { RuntimeMessageType } from "@immersionkit/shared";
import { describe, expect, it } from "vitest";

import { BackgroundAccountService } from "../src/background/account-service";
import { ImmersionKitApiClient } from "../src/background/api-client";
import {
  BackgroundActivationEventQueue,
  sanitizeActivationProperties
} from "../src/background/event-queue";
import { BackgroundRuntimeCoordinator } from "../src/background/runtime";
import {
  loadUserDataValues,
  setUserDataValues,
  USER_DATA_KEYS
} from "../src/storage/user-data-repository";
import { installChromeStub } from "./helpers/chrome-stub";
import { installIndexedDbStub } from "./helpers/indexeddb-stub";

describe("commercial preview account and telemetry guards", () => {
  it("keeps account session data behind background-owned messages", async () => {
    const indexedDbStub = installIndexedDbStub();
    const chromeStub = installChromeStub();

    try {
      await setUserDataValues({
        [USER_DATA_KEYS.accountProfile]: {
          userId: "user-1",
          email: "learner@example.com",
          provider: "google",
          previewStatus: "active",
          signedInAt: "2026-05-20T10:00:00.000Z"
        },
        [USER_DATA_KEYS.accountSession]: {
          accessToken: "secret-token",
          expiresAt: "2099-05-21T10:00:00.000Z"
        }
      });

      const coordinator = new BackgroundRuntimeCoordinator();
      coordinator.boot();

      await expect(
        chromeStub.dispatchRuntimeMessage(
          {
            type: RuntimeMessageType.GetUserData,
            keys: [USER_DATA_KEYS.accountSession]
          },
          { url: "https://example.com/article" }
        )
      ).resolves.toEqual([
        {
          ok: false,
          error: "user-data-read-forbidden"
        }
      ]);
    } finally {
      chromeStub.restore();
      indexedDbStub.restore();
    }
  });

  it("logs out account session without deleting local install identity", async () => {
    const indexedDbStub = installIndexedDbStub();
    const chromeStub = installChromeStub();
    const accountService = new BackgroundAccountService({
      apiClient: new ImmersionKitApiClient({ baseUrl: null })
    });

    try {
      const install = await accountService.ensureInstallIdentity();
      await setUserDataValues({
        [USER_DATA_KEYS.accountProfile]: {
          userId: "user-1",
          email: "learner@example.com",
          provider: "google",
          previewStatus: "active",
          signedInAt: "2026-05-20T10:00:00.000Z"
        },
        [USER_DATA_KEYS.accountSession]: {
          accessToken: "secret-token",
          expiresAt: "2099-05-21T10:00:00.000Z"
        }
      });

      const state = await accountService.logout();
      const values = await loadUserDataValues([
        USER_DATA_KEYS.accountProfile,
        USER_DATA_KEYS.accountSession,
        USER_DATA_KEYS.installIdentity
      ]);

      expect(state.status).toBe("signed-out");
      expect(values[USER_DATA_KEYS.accountProfile]).toBeUndefined();
      expect(values[USER_DATA_KEYS.accountSession]).toBeUndefined();
      expect(values[USER_DATA_KEYS.installIdentity]).toMatchObject({
        installId: install.installId
      });
    } finally {
      chromeStub.restore();
      indexedDbStub.restore();
    }
  });

  it("accepts only fixed content-free activation telemetry properties", () => {
    expect(
      sanitizeActivationProperties({
        surface: "content",
        helpSurface: "word",
        action: "open",
        count: 3
      })
    ).toEqual({
      surface: "content",
      helpSurface: "word",
      action: "open",
      count: 3
    });

    expect(() =>
      sanitizeActivationProperties({
        sentenceText: "The private page sentence.",
        url: "https://example.com/private",
        itemId: "word:private"
      })
    ).toThrow("telemetry-property-forbidden");
  });

  it("persists queued activation events without private payload fields", async () => {
    const indexedDbStub = installIndexedDbStub();
    const chromeStub = installChromeStub();
    const accountService = new BackgroundAccountService({
      apiClient: new ImmersionKitApiClient({ baseUrl: null })
    });
    const queue = new BackgroundActivationEventQueue({
      accountService,
      apiClient: new ImmersionKitApiClient({ baseUrl: null })
    });

    try {
      await queue.queueEvent({
        eventName: "help_opened",
        properties: {
          surface: "content",
          helpSurface: "phrase",
          action: "open"
        }
      });

      const values = await loadUserDataValues([USER_DATA_KEYS.telemetryState]);
      expect(JSON.stringify(values[USER_DATA_KEYS.telemetryState])).not.toMatch(
        /sentenceText|sourceText|targetText|provider|vocab|phraseId|review|url/i
      );
      expect(values[USER_DATA_KEYS.telemetryState]).toMatchObject({
        pendingEvents: [
          {
            eventName: "help_opened",
            properties: {
              surface: "content",
              helpSurface: "phrase",
              action: "open"
            }
          }
        ]
      });
    } finally {
      chromeStub.restore();
      indexedDbStub.restore();
    }
  });
});
