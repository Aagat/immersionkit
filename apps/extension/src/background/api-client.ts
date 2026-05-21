import type {
  ActivationEventName,
  ActivationEventProperties,
  FeedbackCategory,
  PreviewAccountProfile,
  PreviewInstallIdentity
} from "@immersionkit/shared";

type RequestOptions = {
  accessToken?: string | null;
};

export type ApiAccountSession = {
  accessToken: string;
  expiresAt: string;
  refreshToken?: string | null;
};

export type StartGoogleOAuthResponse = {
  authUrl: string;
  state: string;
};

export type CompleteGoogleOAuthResponse = {
  profile: PreviewAccountProfile;
  session: ApiAccountSession;
  install?: Partial<PreviewInstallIdentity>;
};

export type RegisterInstallResponse = {
  install: Partial<PreviewInstallIdentity>;
};

export type SubmitActivationEvent = {
  eventId: string;
  eventName: ActivationEventName;
  occurredAt: string;
  installId: string;
  extensionVersion: string;
  languagePair: string;
  assetVersion: string | null;
  properties: ActivationEventProperties;
};

export type SubmitFeedbackInput = {
  category: FeedbackCategory;
  description: string;
  diagnostics?: unknown;
  installId: string;
};

export class ImmersionKitApiClient {
  private readonly baseUrl: string | null;
  private readonly fetchImpl: typeof fetch;

  constructor(options: { baseUrl?: string | null; fetchImpl?: typeof fetch } = {}) {
    this.baseUrl =
      options.baseUrl === undefined
        ? normalizeBaseUrl(import.meta.env.VITE_IMMERSIONKIT_API_BASE_URL)
        : normalizeBaseUrl(options.baseUrl);
    this.fetchImpl =
      options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl);
  }

  async startGoogleOAuth(input: {
    redirectUri: string;
    installId: string;
  }): Promise<StartGoogleOAuthResponse> {
    const url = this.buildUrl("/auth/google/start");
    url.searchParams.set("redirect_uri", input.redirectUri);
    url.searchParams.set("install_id", input.installId);
    return parseStartGoogleOAuthResponse(await this.requestJson(url, undefined));
  }

  async completeGoogleOAuth(input: {
    callbackUrl: string;
    state: string;
    installId: string;
  }): Promise<CompleteGoogleOAuthResponse> {
    return parseCompleteGoogleOAuthResponse(
      await this.requestJson("/auth/google/callback", {
        method: "POST",
        body: JSON.stringify(input)
      })
    );
  }

  async registerInstall(
    install: PreviewInstallIdentity,
    options: RequestOptions = {}
  ): Promise<RegisterInstallResponse> {
    return parseRegisterInstallResponse(
      await this.requestJson(
        "/installs/register",
        {
          method: "POST",
          body: JSON.stringify({ install })
        },
        options
      )
    );
  }

  async submitActivationEvents(
    events: readonly SubmitActivationEvent[],
    options: RequestOptions = {}
  ): Promise<void> {
    await this.requestJson(
      "/events/batch",
      {
        method: "POST",
        body: JSON.stringify({ events })
      },
      options
    );
  }

  async submitFeedback(
    feedback: SubmitFeedbackInput,
    options: RequestOptions = {}
  ): Promise<void> {
    await this.requestJson(
      "/feedback",
      {
        method: "POST",
        body: JSON.stringify(feedback)
      },
      options
    );
  }

  private buildUrl(path: string): URL {
    if (!this.baseUrl) {
      throw new Error("api-base-url-missing");
    }

    return new URL(path, `${this.baseUrl}/`);
  }

  private async requestJson(
    pathOrUrl: string | URL,
    init: RequestInit | undefined,
    options: RequestOptions = {}
  ): Promise<unknown> {
    const url = typeof pathOrUrl === "string" ? this.buildUrl(pathOrUrl) : pathOrUrl;
    const headers = new Headers(init?.headers);
    headers.set("accept", "application/json");
    if (init?.body) {
      headers.set("content-type", "application/json");
    }
    if (options.accessToken) {
      headers.set("authorization", `Bearer ${options.accessToken}`);
    }

    const response = await this.fetchImpl(url.toString(), {
      ...init,
      headers
    });
    if (!response.ok) {
      throw new Error(`api-request-failed:${response.status}`);
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }
}

function normalizeBaseUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\/+$/, "") : null;
}

function parseStartGoogleOAuthResponse(input: unknown): StartGoogleOAuthResponse {
  if (!isRecord(input)) {
    throw new Error("invalid-oauth-start-response");
  }
  const authUrl = readString(input.authUrl);
  const state = readString(input.state);
  if (!authUrl || !state) {
    throw new Error("invalid-oauth-start-response");
  }
  return { authUrl, state };
}

function parseCompleteGoogleOAuthResponse(
  input: unknown
): CompleteGoogleOAuthResponse {
  if (!isRecord(input)) {
    throw new Error("invalid-oauth-complete-response");
  }
  const profile = parsePreviewAccountProfile(input.profile);
  const session = parseApiAccountSession(input.session);
  if (!profile || !session) {
    throw new Error("invalid-oauth-complete-response");
  }
  return {
    profile,
    session,
    install: isRecord(input.install) ? input.install : undefined
  };
}

function parseRegisterInstallResponse(input: unknown): RegisterInstallResponse {
  if (!isRecord(input) || !isRecord(input.install)) {
    throw new Error("invalid-install-response");
  }
  return { install: input.install };
}

export function parsePreviewAccountProfile(
  input: unknown
): PreviewAccountProfile | null {
  if (!isRecord(input)) {
    return null;
  }
  const userId = readString(input.userId);
  const email = readString(input.email);
  const provider = readString(input.provider);
  const signedInAt = readString(input.signedInAt);
  const previewStatus = readString(input.previewStatus) ?? "active";
  if (
    !userId ||
    !email ||
    !signedInAt ||
    (provider !== "google" && provider !== "github") ||
    (previewStatus !== "active" &&
      previewStatus !== "pending" &&
      previewStatus !== "disabled")
  ) {
    return null;
  }
  return { userId, email, provider, previewStatus, signedInAt };
}

export function parseApiAccountSession(input: unknown): ApiAccountSession | null {
  if (!isRecord(input)) {
    return null;
  }
  const accessToken = readString(input.accessToken);
  const expiresAt = readString(input.expiresAt);
  if (!accessToken || !expiresAt) {
    return null;
  }
  return {
    accessToken,
    expiresAt,
    refreshToken: readString(input.refreshToken)
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
