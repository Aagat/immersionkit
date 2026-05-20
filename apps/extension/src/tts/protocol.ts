import type { TtsVoiceId } from "@immersionkit/shared";
import type { PiperTtsVoiceLanguage } from "../background/tts-assets";

export const OFFSCREEN_TTS_DOCUMENT_PATH = "tts-offscreen.html";
export const OFFSCREEN_TTS_MESSAGE_TYPE = "tts/offscreen/speak";

export type OffscreenTtsSpeakMessage = {
  type: typeof OFFSCREEN_TTS_MESSAGE_TYPE;
  text: string;
  voiceId: TtsVoiceId;
  language: PiperTtsVoiceLanguage;
  rate: number;
};

export type OffscreenTtsSpeakResponse =
  | {
      ok: true;
      engine: "piper";
    }
  | {
      ok: false;
      error: string;
    };
