import {
  DEFAULT_LANGUAGE_PAIR_ID,
  type PreviewAccountProfile,
  type PreviewAccountState,
  type PreviewInstallIdentity
} from "@immersionkit/shared";

import { ACCOUNT_REQUIRED } from "../build-profile";
import {
  loadUserDataValues,
  removeUserDataValues,
  setUserDataValues
} from "../storage/user-data-repository";
import { USER_DATA_KEYS } from "../shared/user-data-keys";
import {
  ImmersionKitApiClient,
  parseApiAccountSession,
  parsePreviewAccountProfile,
  type ApiAccountSession
} from "./api-client";

const SESSION_EXPIRY_SKEW_MS = 60_000;

type LaunchWebAuthFlow = (details: {
  url: string;
  interactive: boolean;
}) => Promise<string>;

export class BackgroundAccountService {
  private readonly apiClient: ImmersionKitApiClient;
  private readonly launchWebAuthFlow: LaunchWebAuthFlow;

  constructor(options: {
    apiClient?: ImmersionKitApiClient;
    launchWebAuthFlow?: LaunchWebAuthFlow;
  } = {}) {
    this.apiClient = options.apiClient ?? new ImmersionKitApiClient();
    this.launchWebAuthFlow =
      options.launchWebAuthFlow ?? launchChromeWebAuthFlow;
  }

  async getState(): Promise<PreviewAccountState> {
    const [profile, session, install] = await Promise.all([
      this.loadProfile(),
      this.loadSession(),
      this.ensureInstallIdentity()
    ]);
    const signedIn =
      Boolean(profile) &&
      Boolean(session) &&
      sessionHasTimeRemaining(session as ApiAccountSession);

    return {
      accountRequired: ACCOUNT_REQUIRED,
      status: signedIn ? "signed-in" : "signed-out",
      profile: signedIn ? profile : null,
      install,
      signInProvider: "google",
      canStartSignIn: this.apiClient.isConfigured()
    };
  }

  async isReadingAllowed(): Promise<boolean> {
    if (!ACCOUNT_REQUIRED) {
      return true;
    }
    return (await this.getState()).status === "signed-in";
  }

  async startGoogleLogin(): Promise<PreviewAccountState> {
    if (!this.apiClient.isConfigured()) {
      throw new Error("api-unavailable");
    }

    const install = await this.registerInstallIfPossible(
      await this.ensureInstallIdentity()
    );
    const redirectUri = readChromeRedirectUri();
    const oauthStart = await this.apiClient.startGoogleOAuth({
      redirectUri,
      installId: install.installId
    });
    const callbackUrl = await this.launchWebAuthFlow({
      url: oauthStart.authUrl,
      interactive: true
    });
    const completed = await this.apiClient.completeGoogleOAuth({
      callbackUrl,
      state: oauthStart.state,
      installId: install.installId
    });

    await setUserDataValues({
      [USER_DATA_KEYS.accountProfile]: completed.profile,
      [USER_DATA_KEYS.accountSession]: completed.session,
      [USER_DATA_KEYS.installIdentity]: {
        ...install,
        ...completed.install,
        registrationState:
          completed.install?.registrationState === "registered"
            ? "registered"
            : install.registrationState,
        registeredAt:
          typeof completed.install?.registeredAt === "string"
            ? completed.install.registeredAt
            : install.registeredAt
      }
    });

    return this.getState();
  }

  async logout(): Promise<PreviewAccountState> {
    await removeUserDataValues([
      USER_DATA_KEYS.accountProfile,
      USER_DATA_KEYS.accountSession
    ]);
    return this.getState();
  }

  async loadSessionForApi(): Promise<ApiAccountSession | null> {
    const session = await this.loadSession();
    return session && sessionHasTimeRemaining(session) ? session : null;
  }

  async ensureInstallIdentity(): Promise<PreviewInstallIdentity> {
    const values = await loadUserDataValues([USER_DATA_KEYS.installIdentity]);
    const existing = parseInstallIdentity(values[USER_DATA_KEYS.installIdentity]);
    if (existing) {
      return existing;
    }

    const install: PreviewInstallIdentity = {
      installId: createInstallId(),
      languagePair: DEFAULT_LANGUAGE_PAIR_ID,
      extensionVersion: readExtensionVersion(),
      assetVersion: null,
      registeredAt: null,
      registrationState: "local"
    };
    await setUserDataValues({ [USER_DATA_KEYS.installIdentity]: install });
    return install;
  }

  private async registerInstallIfPossible(
    install: PreviewInstallIdentity
  ): Promise<PreviewInstallIdentity> {
    if (!this.apiClient.isConfigured() || install.registrationState === "registered") {
      return install;
    }

    try {
      const response = await this.apiClient.registerInstall(install);
      const registeredInstall: PreviewInstallIdentity = {
        ...install,
        ...response.install,
        registrationState:
          response.install.registrationState === "registered"
            ? "registered"
            : install.registrationState,
        registeredAt:
          typeof response.install.registeredAt === "string"
            ? response.install.registeredAt
            : install.registeredAt
      };
      await setUserDataValues({
        [USER_DATA_KEYS.installIdentity]: registeredInstall
      });
      return registeredInstall;
    } catch (error) {
      console.warn("ImmersionKit install registration failed.", error);
      return install;
    }
  }

  private async loadProfile(): Promise<PreviewAccountProfile | null> {
    const values = await loadUserDataValues([USER_DATA_KEYS.accountProfile]);
    return parsePreviewAccountProfile(values[USER_DATA_KEYS.accountProfile]);
  }

  private async loadSession(): Promise<ApiAccountSession | null> {
    const values = await loadUserDataValues([USER_DATA_KEYS.accountSession]);
    return parseApiAccountSession(values[USER_DATA_KEYS.accountSession]);
  }
}

export function parseInstallIdentity(input: unknown): PreviewInstallIdentity | null {
  if (!isRecord(input)) {
    return null;
  }
  const installId = readString(input.installId);
  const languagePair = readString(input.languagePair);
  const extensionVersion = readString(input.extensionVersion);
  const registrationState = readString(input.registrationState) ?? "local";
  if (
    !installId ||
    !languagePair ||
    !extensionVersion ||
    (registrationState !== "local" && registrationState !== "registered")
  ) {
    return null;
  }
  return {
    installId,
    languagePair: languagePair === "en-es" ? "en-es" : DEFAULT_LANGUAGE_PAIR_ID,
    extensionVersion,
    assetVersion: readString(input.assetVersion),
    registeredAt: readString(input.registeredAt),
    registrationState
  };
}

function sessionHasTimeRemaining(session: ApiAccountSession): boolean {
  const expiry = Date.parse(session.expiresAt);
  return Number.isFinite(expiry) && expiry - Date.now() > SESSION_EXPIRY_SKEW_MS;
}

function launchChromeWebAuthFlow(details: {
  url: string;
  interactive: boolean;
}): Promise<string> {
  if (typeof chrome === "undefined" || !chrome.identity?.launchWebAuthFlow) {
    return Promise.reject(new Error("identity-api-unavailable"));
  }

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(details, (callbackUrl) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!callbackUrl) {
        reject(new Error("oauth-callback-missing"));
        return;
      }
      resolve(callbackUrl);
    });
  });
}

function readChromeRedirectUri(): string {
  if (typeof chrome !== "undefined" && chrome.identity?.getRedirectURL) {
    return chrome.identity.getRedirectURL("oauth/google");
  }
  const extensionId =
    typeof chrome !== "undefined" && chrome.runtime?.id
      ? chrome.runtime.id
      : "immersionkit";
  return `https://${extensionId}.chromiumapp.org/oauth/google`;
}

function readExtensionVersion(): string {
  if (typeof chrome !== "undefined" && chrome.runtime?.getManifest) {
    return chrome.runtime.getManifest().version;
  }
  return "0.1.0";
}

function createInstallId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ik-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
