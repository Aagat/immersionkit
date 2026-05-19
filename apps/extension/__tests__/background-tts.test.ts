import {
  RuntimeMessageType,
  type SpeakTextMessage,
  type SpeakTextResponse
} from "@immersionkit/shared";
import { describe, expect, it, vi } from "vitest";

import { BackgroundTextToSpeechService } from "../src/background/tts";

const DEFAULT_TEST_RATES = {
  word: 0.8,
  phrase: 0.9,
  sentence: 0.7
};

describe("background text to speech", () => {
  it("validates SpeakText messages before initializing Piper", async () => {
    const ensurePiperAssets = vi.fn();
    const service = new BackgroundTextToSpeechService({
      ensurePiperAssets
    });

    await expect(service.speak(createSpeakMessage({ text: " " }))).resolves.toEqual({
      ok: false,
      error: "empty-text"
    });
    await expect(
      service.speak(createSpeakMessage({ language: "en-US" as "es-ES" }))
    ).resolves.toEqual({
      ok: false,
      error: "unsupported-language"
    });

    expect(ensurePiperAssets).not.toHaveBeenCalled();
  });

  it("uses Piper when assets and offscreen playback are ready", async () => {
    const ensurePiperAssets = vi.fn().mockResolvedValue(undefined);
    const ensureOffscreenDocument = vi.fn().mockResolvedValue(undefined);
    const sendOffscreenSpeak = vi.fn().mockResolvedValue({
      ok: true,
      engine: "piper"
    });
    const chromeTtsSpeak = vi.fn();
    const service = new BackgroundTextToSpeechService({
      loadTtsPlaybackSettings: async () => ({
        voiceId: "es_ES-davefx-medium",
        fallbackBehavior: "piper-with-system-fallback",
        language: "es-ES",
        rates: DEFAULT_TEST_RATES
      }),
      ensurePiperAssets,
      ensureOffscreenDocument,
      sendOffscreenSpeak,
      chromeTtsSpeak
    });

    await expect(service.speak(createSpeakMessage())).resolves.toEqual({
      ok: true,
      engine: "piper"
    });
    expect(ensurePiperAssets).toHaveBeenCalledWith("es_ES-davefx-medium");
    expect(ensureOffscreenDocument).toHaveBeenCalledTimes(1);
    expect(sendOffscreenSpeak).toHaveBeenCalledWith({
      type: "tts/offscreen/speak",
      text: "La ciudad abre temprano.",
      voiceId: "es_ES-davefx-medium",
      language: "es-ES",
      rate: 0.8
    });
    expect(chromeTtsSpeak).not.toHaveBeenCalled();
  });

  it("runs the first-use asset cache step before Piper playback", async () => {
    const calls: string[] = [];
    const service = new BackgroundTextToSpeechService({
      loadTtsPlaybackSettings: async () => ({
        voiceId: "es_AR-daniela-high",
        fallbackBehavior: "piper-with-system-fallback",
        language: "es-AR",
        rates: DEFAULT_TEST_RATES
      }),
      ensurePiperAssets: async (voiceId) => {
        calls.push(`assets:${voiceId}`);
      },
      ensureOffscreenDocument: async () => {
        calls.push("offscreen");
      },
      sendOffscreenSpeak: async (message) => {
        calls.push(`speak:${message.voiceId}:${message.language}:${message.rate}`);
        return { ok: true, engine: "piper" };
      }
    });

    await service.speak(createSpeakMessage({ surface: "sentence" }));

    expect(calls).toEqual([
      "assets:es_AR-daniela-high",
      "offscreen",
      "speak:es_AR-daniela-high:es-AR:0.7"
    ]);
  });

  it("falls back to Chrome TTS when Piper cannot initialize", async () => {
    const chromeTtsSpeak = vi.fn(
      async (): Promise<SpeakTextResponse> => ({
        ok: true,
        engine: "chrome-tts"
      })
    );
    const service = new BackgroundTextToSpeechService({
      loadTtsPlaybackSettings: async () => ({
        voiceId: "es_ES-davefx-medium",
        fallbackBehavior: "piper-with-system-fallback",
        language: "es-ES",
        rates: DEFAULT_TEST_RATES
      }),
      ensurePiperAssets: async () => {
        throw new Error("cache unavailable");
      },
      sendOffscreenSpeak: vi.fn(),
      chromeTtsSpeak
    });

    await expect(service.speak(createSpeakMessage())).resolves.toEqual({
      ok: true,
      engine: "chrome-tts"
    });
    expect(chromeTtsSpeak).toHaveBeenCalledWith(
      "La ciudad abre temprano.",
      "es-ES",
      0.8
    );
  });

  it("falls back to Chrome TTS when offscreen Piper playback reports an error", async () => {
    const chromeTtsSpeak = vi.fn(
      async (): Promise<SpeakTextResponse> => ({
        ok: true,
        engine: "chrome-tts"
      })
    );
    const service = new BackgroundTextToSpeechService({
      loadTtsPlaybackSettings: async () => ({
        voiceId: "es_ES-davefx-medium",
        fallbackBehavior: "piper-with-system-fallback",
        language: "es-ES",
        rates: DEFAULT_TEST_RATES
      }),
      ensurePiperAssets: async () => undefined,
      ensureOffscreenDocument: async () => undefined,
      sendOffscreenSpeak: async () => ({
        ok: false,
        error: "piper-playback-failed"
      }),
      chromeTtsSpeak
    });

    await expect(service.speak(createSpeakMessage())).resolves.toEqual({
      ok: true,
      engine: "chrome-tts"
    });
  });

  it("can use the system voice only when fallback behavior requests it", async () => {
    const ensurePiperAssets = vi.fn();
    const ensureOffscreenDocument = vi.fn();
    const chromeTtsSpeak = vi.fn(
      async (): Promise<SpeakTextResponse> => ({
        ok: true,
        engine: "chrome-tts"
      })
    );
    const service = new BackgroundTextToSpeechService({
      loadTtsPlaybackSettings: async () => ({
        voiceId: "es_AR-daniela-high",
        fallbackBehavior: "system-only",
        language: "es-AR",
        rates: DEFAULT_TEST_RATES
      }),
      ensurePiperAssets,
      ensureOffscreenDocument,
      chromeTtsSpeak
    });

    await expect(service.speak(createSpeakMessage())).resolves.toEqual({
      ok: true,
      engine: "chrome-tts"
    });
    expect(ensurePiperAssets).not.toHaveBeenCalled();
    expect(ensureOffscreenDocument).not.toHaveBeenCalled();
    expect(chromeTtsSpeak).toHaveBeenCalledWith(
      "La ciudad abre temprano.",
      "es-AR",
      0.8
    );
  });

  it("does not use Chrome TTS when Piper-only playback fails", async () => {
    const chromeTtsSpeak = vi.fn();
    const service = new BackgroundTextToSpeechService({
      loadTtsPlaybackSettings: async () => ({
        voiceId: "es_ES-davefx-medium",
        fallbackBehavior: "piper-only",
        language: "es-ES",
        rates: DEFAULT_TEST_RATES
      }),
      ensurePiperAssets: async () => undefined,
      ensureOffscreenDocument: async () => undefined,
      sendOffscreenSpeak: async () => ({
        ok: false,
        error: "piper-playback-failed"
      }),
      chromeTtsSpeak
    });

    await expect(service.speak(createSpeakMessage())).resolves.toEqual({
      ok: false,
      error: "piper-playback-failed"
    });
    expect(chromeTtsSpeak).not.toHaveBeenCalled();
  });
});

function createSpeakMessage(
  overrides: Partial<SpeakTextMessage> = {}
): SpeakTextMessage {
  return {
    type: RuntimeMessageType.SpeakText,
    text: "La ciudad abre temprano.",
    language: "es-ES",
    surface: "word",
    ...overrides
  };
}
