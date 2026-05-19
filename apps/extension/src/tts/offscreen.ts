import * as ort from "onnxruntime-web/wasm";
import { isTtsVoiceId, type TtsVoiceId } from "@immersionkit/shared";

import {
  getPiperTtsVoiceInfo,
  getPiperVoiceAssetClient,
  type PiperTtsAssetId,
  type PiperVoiceAsset,
  type PiperVoiceConfig
} from "../background/tts-assets";
import {
  OFFSCREEN_TTS_MESSAGE_TYPE,
  type OffscreenTtsSpeakMessage,
  type OffscreenTtsSpeakResponse
} from "./protocol";

type PiperPhonemizeModule = {
  callMain(args: string[]): number;
};

type CreatePiperPhonemize = (module: {
  locateFile: (path: string) => string;
  print: (output: string) => void;
  printErr?: (output: string) => void;
}) => Promise<PiperPhonemizeModule>;

type PhonemizerResult = {
  text: string;
  phonemes: string[][];
};

type LocalPhonemizer = {
  phonemize(texts: readonly string[], language: string): PhonemizerResult[];
};

const DEFAULT_SAMPLE_RATE = 22050;
const DEFAULT_NUM_CHANNELS = 1;
const DEFAULT_NOISE_SCALE = 0.667;
const DEFAULT_LENGTH_SCALE = 1;
const DEFAULT_NOISE_W = 0.8;
const DEFAULT_PLAYBACK_RATE = 1;
const SENTENCE_SILENCE_SECONDS = 0.2;
const PHONEME_PAD = "_";
const PHONEME_BOS = "^";
const PHONEME_EOS = "$";

ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = {
  mjs: chrome.runtime.getURL("ort/ort-wasm-simd-threaded.mjs"),
  wasm: chrome.runtime.getURL("ort/ort-wasm-simd-threaded.wasm")
};

class PiperOffscreenPlayer {
  private readonly voiceAssets = getPiperVoiceAssetClient();
  private phonemizerPromise: Promise<LocalPhonemizer> | null = null;
  private readonly sessionPromisesByVoiceId = new Map<
    PiperTtsAssetId,
    Promise<ort.InferenceSession>
  >();
  private audioContext: AudioContext | null = null;
  private activeSource: AudioBufferSourceNode | null = null;

  async speak(
    text: string,
    voiceId: TtsVoiceId,
    playbackRate: number
  ): Promise<void> {
    const voice = await this.voiceAssets.ensureVoice(voiceId);
    const voiceInfo = getPiperTtsVoiceInfo(voiceId);
    const phrases = await this.phonemizeText(voice, text);
    if (phrases.length === 0) {
      throw new Error("piper-no-phonemes");
    }

    const pcmChunks: Float32Array<ArrayBuffer>[] = [];
    const sampleRate = readSampleRate(voice.config, voice.manifest.sampleRate);
    for (const phrase of phrases) {
      pcmChunks.push(
        await this.inferPhrase(voice, phrase, {
          speakerId: voiceInfo.speakerId,
          playbackRate
        })
      );
      pcmChunks.push(new Float32Array(Math.round(sampleRate * SENTENCE_SILENCE_SECONDS)));
    }

    await this.playPcm(concatPcm(pcmChunks), sampleRate);
  }

  private async phonemizeText(
    voice: PiperVoiceAsset,
    text: string
  ): Promise<number[][]> {
    const language = voice.config.espeak?.voice ?? "es";
    const phonemizer = await this.getPhonemizer();
    const results = phonemizer.phonemize([text], language);
    const firstResult = results[0];
    if (!firstResult || firstResult.text !== text) {
      throw new Error("piper-phonemizer-unexpected-output");
    }

    return firstResult.phonemes
      .filter((phonemes) => phonemes.length > 0)
      .map((phonemes) => toPhonemeIds(phonemes, voice.config))
      .filter((phonemeIds) => phonemeIds.length > 0);
  }

  private getPhonemizer(): Promise<LocalPhonemizer> {
    this.phonemizerPromise ??= createLocalPhonemizer();
    return this.phonemizerPromise;
  }

  private async getSession(voice: PiperVoiceAsset): Promise<ort.InferenceSession> {
    const voiceId = voice.manifest.voiceId;
    let sessionPromise = this.sessionPromisesByVoiceId.get(voiceId);
    if (!sessionPromise) {
      sessionPromise = ort.InferenceSession.create(voice.modelBuffer, {
        executionProviders: ["wasm"]
      });
      this.sessionPromisesByVoiceId.set(voiceId, sessionPromise);
    }

    return sessionPromise;
  }

  private async inferPhrase(
    voice: PiperVoiceAsset,
    phonemeIds: readonly number[],
    options: {
      speakerId?: number;
      playbackRate: number;
    }
  ): Promise<Float32Array<ArrayBuffer>> {
    const config = voice.config;
    const session = await this.getSession(voice);
    const noiseScale = readNumber(config.inference?.noise_scale, DEFAULT_NOISE_SCALE);
    const lengthScale = readNumber(
      config.inference?.length_scale,
      DEFAULT_LENGTH_SCALE
    ) / readPlaybackRate(options.playbackRate);
    const noiseW = readNumber(config.inference?.noise_w, DEFAULT_NOISE_W);
    const feeds: Record<string, ort.Tensor> = {
      input: new ort.Tensor("int64", [...phonemeIds], [1, phonemeIds.length]),
      input_lengths: new ort.Tensor("int64", [phonemeIds.length], [1]),
      scales: new ort.Tensor(
        "float32",
        new Float32Array([noiseScale, lengthScale, noiseW]),
        [3]
      )
    };
    const speakerId = resolveSpeakerId(config, options.speakerId);
    if (speakerId !== null) {
      feeds.sid = new ort.Tensor("int64", [speakerId], [1]);
    }

    const result = await session.run(feeds);
    const output = result.output;
    if (!output || !(output.data instanceof Float32Array)) {
      throw new Error("piper-invalid-output");
    }

    return new Float32Array(output.data);
  }

  private async playPcm(
    samples: Float32Array<ArrayBuffer>,
    sampleRate: number
  ): Promise<void> {
    this.activeSource?.stop();
    const audioContext = (this.audioContext ??= new AudioContext());
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    const audioBuffer = audioContext.createBuffer(
      DEFAULT_NUM_CHANNELS,
      samples.length,
      sampleRate
    );
    audioBuffer.copyToChannel(samples, 0);

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    this.activeSource = source;

    await new Promise<void>((resolve) => {
      source.onended = () => {
        if (this.activeSource === source) {
          this.activeSource = null;
        }
        resolve();
      };
      source.start();
    });
  }
}

async function createLocalPhonemizer(): Promise<LocalPhonemizer> {
  await ensurePiperPhonemizerScript();
  const createPiperPhonemize = (
    globalThis as typeof globalThis & {
      createPiperPhonemize?: CreatePiperPhonemize;
    }
  ).createPiperPhonemize;
  if (!createPiperPhonemize) {
    throw new Error("piper-phonemizer-unavailable");
  }

  let results: PhonemizerResult[] = [];
  const module = await createPiperPhonemize({
    locateFile: (path) => chrome.runtime.getURL(`tts/piper-phonemize/${path}`),
    print(output) {
      results.push(JSON.parse(output) as PhonemizerResult);
    },
    printErr(output) {
      console.warn("ImmersionKit Piper phonemizer:", output);
    }
  });

  return {
    phonemize(texts, language) {
      results = [];
      const exitCode = module.callMain([
        "--espeak_data",
        "/espeak-ng-data",
        "--language",
        language,
        "--input",
        JSON.stringify(texts.map((entry) => ({ text: entry })))
      ]);
      if (exitCode !== 0) {
        throw new Error(`piper-phonemizer-exit-${exitCode}`);
      }

      return results;
    }
  };
}

async function ensurePiperPhonemizerScript(): Promise<void> {
  if (
    (globalThis as typeof globalThis & {
      createPiperPhonemize?: CreatePiperPhonemize;
    }).createPiperPhonemize
  ) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL(
      "tts/piper-phonemize/piper_phonemize.js"
    );
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("piper-phonemizer-load-failed"));
    document.head.append(script);
  });
}

function toPhonemeIds(
  phonemes: readonly string[],
  modelConfig: PiperVoiceConfig
): number[] {
  const map = modelConfig.phoneme_id_map;
  if (!map) {
    throw new Error("piper-missing-phoneme-map");
  }

  const phonemeIds: number[] = [];
  appendPhonemeIds(phonemeIds, map, PHONEME_BOS);
  appendPhonemeIds(phonemeIds, map, PHONEME_PAD);

  for (const phoneme of phonemes) {
    appendPhonemeIds(phonemeIds, map, phoneme);
    appendPhonemeIds(phonemeIds, map, PHONEME_PAD);
  }

  appendPhonemeIds(phonemeIds, map, PHONEME_EOS);
  return phonemeIds;
}

function appendPhonemeIds(
  target: number[],
  map: Record<string, readonly number[]>,
  phoneme: string
): void {
  const ids = map[phoneme];
  if (ids) {
    target.push(...ids);
  }
}

function concatPcm(
  chunks: readonly Float32Array<ArrayBuffer>[]
): Float32Array<ArrayBuffer> {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const combined = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  return combined;
}

function readSampleRate(config: PiperVoiceConfig, fallback: number): number {
  return readNumber(config.audio?.sample_rate, fallback || DEFAULT_SAMPLE_RATE);
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readPlaybackRate(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_PLAYBACK_RATE;
}

function resolveSpeakerId(
  config: PiperVoiceConfig,
  configuredSpeakerId: number | undefined
): number | null {
  if (typeof configuredSpeakerId === "number") {
    return configuredSpeakerId;
  }

  const speakerCount = readNumber(config.num_speakers, 0);
  return speakerCount > 1 ? 0 : null;
}

function isOffscreenTtsSpeakMessage(
  message: unknown
): message is OffscreenTtsSpeakMessage {
  const voiceId =
    typeof message === "object" && message !== null
      ? (message as OffscreenTtsSpeakMessage).voiceId
      : null;
  const voiceInfo = isTtsVoiceId(voiceId) ? getPiperTtsVoiceInfo(voiceId) : null;
  const rate =
    typeof message === "object" && message !== null
      ? (message as OffscreenTtsSpeakMessage).rate
      : null;

  return (
    typeof message === "object" &&
    message !== null &&
    (message as OffscreenTtsSpeakMessage).type === OFFSCREEN_TTS_MESSAGE_TYPE &&
    Boolean(voiceInfo) &&
    (message as OffscreenTtsSpeakMessage).language === voiceInfo?.language &&
    typeof rate === "number" &&
    Number.isFinite(rate) &&
    rate > 0 &&
    typeof (message as OffscreenTtsSpeakMessage).text === "string"
  );
}

const player = new PiperOffscreenPlayer();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isOffscreenTtsSpeakMessage(message)) {
    return false;
  }

  void player
    .speak(message.text, message.voiceId, message.rate)
    .then(() => {
      sendResponse({
        ok: true,
        engine: "piper"
      } satisfies OffscreenTtsSpeakResponse);
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "piper-playback-failed"
      } satisfies OffscreenTtsSpeakResponse);
    });

  return true;
});
