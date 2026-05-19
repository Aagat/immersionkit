import {
  DEFAULT_EXTENSION_SETTINGS,
  RuntimeMessageType,
  type TtsFallbackBehavior,
  type TtsPlaybackRateSettings,
  type TtsVoiceId,
  type SpeakTextMessage,
  type SpeakTextResponse,
  type SpeakTextSurface
} from "@immersionkit/shared";

import { diagnosticInfo } from "../shared/logger";
import {
  OFFSCREEN_TTS_DOCUMENT_PATH,
  OFFSCREEN_TTS_MESSAGE_TYPE,
  type OffscreenTtsSpeakResponse
} from "../tts/protocol";
import {
  getPiperVoiceAssetClient,
  getPiperTtsVoiceInfo,
  type PiperTtsVoiceLanguage,
  PIPER_TTS_LANGUAGE
} from "./tts-assets";
import { loadBackgroundRuntimeConfig } from "./settings";

const MAX_SPEAK_TEXT_LENGTH = 500;
const VALID_SPEAK_SURFACES = new Set<SpeakTextSurface>([
  "word",
  "phrase",
  "sentence"
]);

type TtsPlaybackSettings = {
  voiceId: TtsVoiceId;
  fallbackBehavior: TtsFallbackBehavior;
  language: PiperTtsVoiceLanguage;
  rates: TtsPlaybackRateSettings;
};
type LoadTtsPlaybackSettings = () => Promise<TtsPlaybackSettings>;
type EnsurePiperAssets = (voiceId: TtsVoiceId) => Promise<void>;
type EnsureOffscreenDocument = () => Promise<void>;
type SendOffscreenSpeak = (message: {
  type: typeof OFFSCREEN_TTS_MESSAGE_TYPE;
  text: string;
  voiceId: TtsVoiceId;
  language: PiperTtsVoiceLanguage;
  rate: number;
}) => Promise<OffscreenTtsSpeakResponse>;
type ChromeTtsSpeak = (
  text: string,
  language: PiperTtsVoiceLanguage,
  rate: number
) => Promise<SpeakTextResponse>;

export type BackgroundTextToSpeechServiceOptions = {
  loadTtsPlaybackSettings?: LoadTtsPlaybackSettings;
  ensurePiperAssets?: EnsurePiperAssets;
  ensureOffscreenDocument?: EnsureOffscreenDocument;
  sendOffscreenSpeak?: SendOffscreenSpeak;
  chromeTtsSpeak?: ChromeTtsSpeak;
  maxTextLength?: number;
};

export class BackgroundTextToSpeechService {
  private readonly loadTtsPlaybackSettings: LoadTtsPlaybackSettings;
  private readonly ensurePiperAssets: EnsurePiperAssets;
  private readonly ensureOffscreenDocument: EnsureOffscreenDocument;
  private readonly sendOffscreenSpeak: SendOffscreenSpeak;
  private readonly chromeTtsSpeak: ChromeTtsSpeak;
  private readonly maxTextLength: number;

  constructor(options: BackgroundTextToSpeechServiceOptions = {}) {
    this.loadTtsPlaybackSettings =
      options.loadTtsPlaybackSettings ?? loadTtsPlaybackSettings;
    this.ensurePiperAssets =
      options.ensurePiperAssets ??
      (async (voiceId) => {
        await getPiperVoiceAssetClient().ensureVoice(voiceId);
      });
    this.ensureOffscreenDocument =
      options.ensureOffscreenDocument ?? ensureTtsOffscreenDocument;
    this.sendOffscreenSpeak = options.sendOffscreenSpeak ?? sendOffscreenSpeak;
    this.chromeTtsSpeak = options.chromeTtsSpeak ?? speakWithChromeTts;
    this.maxTextLength = options.maxTextLength ?? MAX_SPEAK_TEXT_LENGTH;
  }

  async speak(message: SpeakTextMessage): Promise<SpeakTextResponse> {
    const validation = validateSpeakTextMessage(message, this.maxTextLength);
    if (!validation.ok) {
      return validation;
    }

    const playbackSettings = await this.readPlaybackSettings();
    const playbackRate = selectTtsPlaybackRate(
      playbackSettings.rates,
      message.surface
    );
    if (playbackSettings.fallbackBehavior === "system-only") {
      return this.chromeTtsSpeak(
        validation.text,
        playbackSettings.language,
        playbackRate
      );
    }

    try {
      await this.ensurePiperAssets(playbackSettings.voiceId);
      await this.ensureOffscreenDocument();
      const response = await this.sendOffscreenSpeak({
        type: OFFSCREEN_TTS_MESSAGE_TYPE,
        text: validation.text,
        voiceId: playbackSettings.voiceId,
        language: playbackSettings.language,
        rate: playbackRate
      });
      if (response.ok) {
        return response;
      }

      if (playbackSettings.fallbackBehavior === "piper-only") {
        return response;
      }

      diagnosticInfo("ImmersionKit Piper TTS playback fell back.", response.error);
    } catch (error) {
      if (playbackSettings.fallbackBehavior === "piper-only") {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "piper-unavailable"
        };
      }

      diagnosticInfo("ImmersionKit Piper TTS initialization fell back.", error);
    }

    return this.chromeTtsSpeak(
      validation.text,
      playbackSettings.language,
      playbackRate
    );
  }

  private async readPlaybackSettings(): Promise<TtsPlaybackSettings> {
    try {
      return await this.loadTtsPlaybackSettings();
    } catch (error) {
      diagnosticInfo("ImmersionKit TTS settings fell back to defaults.", error);
      return getDefaultTtsPlaybackSettings();
    }
  }
}

export function isSpeakTextMessage(input: unknown): input is SpeakTextMessage {
  return (
    typeof input === "object" &&
    input !== null &&
    (input as { type?: unknown }).type === RuntimeMessageType.SpeakText
  );
}

function validateSpeakTextMessage(
  message: SpeakTextMessage,
  maxTextLength: number
):
  | {
      ok: true;
      text: string;
    }
  | {
      ok: false;
      error: string;
    } {
  const text = typeof message.text === "string" ? message.text.trim() : "";
  if (!text) {
    return { ok: false, error: "empty-text" };
  }

  if (text.length > maxTextLength) {
    return { ok: false, error: "text-too-long" };
  }

  if (message.language !== PIPER_TTS_LANGUAGE) {
    return { ok: false, error: "unsupported-language" };
  }

  if (!VALID_SPEAK_SURFACES.has(message.surface)) {
    return { ok: false, error: "unsupported-surface" };
  }

  return { ok: true, text };
}

async function ensureTtsOffscreenDocument(): Promise<void> {
  const offscreen = (
    chrome as typeof chrome & {
      offscreen?: {
        hasDocument?: () => Promise<boolean>;
        createDocument?: (options: {
          url: string;
          reasons: string[];
          justification: string;
        }) => Promise<void>;
      };
    }
  ).offscreen;
  if (!offscreen?.createDocument) {
    throw new Error("offscreen-unavailable");
  }

  if (offscreen.hasDocument && (await offscreen.hasDocument())) {
    return;
  }

  try {
    await offscreen.createDocument({
      url: chrome.runtime.getURL(OFFSCREEN_TTS_DOCUMENT_PATH),
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Play local Piper TTS audio for ImmersionKit speaker controls."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("single offscreen document")) {
      return;
    }

    throw error;
  }
}

function sendOffscreenSpeak(message: {
  type: typeof OFFSCREEN_TTS_MESSAGE_TYPE;
  text: string;
  voiceId: TtsVoiceId;
  language: PiperTtsVoiceLanguage;
  rate: number;
}): Promise<OffscreenTtsSpeakResponse> {
  return chrome.runtime.sendMessage(message) as Promise<OffscreenTtsSpeakResponse>;
}

function speakWithChromeTts(
  text: string,
  language: PiperTtsVoiceLanguage,
  rate: number
): Promise<SpeakTextResponse> {
  if (!chrome.tts?.speak) {
    return Promise.resolve({ ok: false, error: "chrome-tts-unavailable" });
  }

  return new Promise((resolve) => {
    let settled = false;
    const settle = (response: SpeakTextResponse) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(response);
    };

    chrome.tts.speak(
      text,
      {
        lang: language,
        enqueue: false,
        rate,
        onEvent: (event) => {
          if (event.type === "error") {
            settle({
              ok: false,
              error: event.errorMessage ?? "chrome-tts-error"
            });
          }
        }
      },
      () => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          settle({
            ok: false,
            error: lastError.message ?? "chrome-tts-error"
          });
          return;
        }

        settle({ ok: true, engine: "chrome-tts" });
      }
    );
  });
}

async function loadTtsPlaybackSettings(): Promise<TtsPlaybackSettings> {
  const runtimeConfig = await loadBackgroundRuntimeConfig();
  const voiceId = runtimeConfig.settings.ttsVoiceId;
  const voiceInfo = getPiperTtsVoiceInfo(voiceId);

  return {
    voiceId,
    fallbackBehavior: runtimeConfig.settings.ttsFallbackBehavior,
    language: voiceInfo.language,
    rates: runtimeConfig.settings.ttsPlaybackRates
  };
}

function getDefaultTtsPlaybackSettings(): TtsPlaybackSettings {
  const voiceId = DEFAULT_EXTENSION_SETTINGS.ttsVoiceId;
  const voiceInfo = getPiperTtsVoiceInfo(voiceId);

  return {
    voiceId,
    fallbackBehavior: DEFAULT_EXTENSION_SETTINGS.ttsFallbackBehavior,
    language: voiceInfo.language,
    rates: DEFAULT_EXTENSION_SETTINGS.ttsPlaybackRates
  };
}

function selectTtsPlaybackRate(
  rates: TtsPlaybackRateSettings,
  surface: SpeakTextSurface
): number {
  return rates[surface];
}
