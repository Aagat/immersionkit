import type {
  ProviderName,
  SentenceLearningNote,
  SupportedSourceLanguage,
  SupportedTargetLanguage
} from "@immersionkit/shared";
import {
  createSentenceLearningNote,
  hasSentenceLearningNoteContent
} from "@immersionkit/shared";

import type { ProviderCredentials } from "./settings";
import { isRecord, readString } from "./storage";

const OPENAI_CHAT_COMPLETIONS_ENDPOINT = "https://api.openai.com/v1/chat/completions";
export const OPENAI_SENTENCE_PROMPT_VERSION = "openai-sentence-v4";
const DEFAULT_OPENAI_MODEL = "gpt-5.4-nano";
const OPENAI_SENTENCE_SYSTEM_PROMPT = `
Translate English sentences into natural, learner-friendly Spanish.

For each sentence:
- translatedText should be idiomatic Spanish a native speaker would naturally say.
- learningNote.summary should be the single most useful takeaway for a learner, written in English. Prefer the format: "To say X, use Y" or "Spanish expresses X with Y".
- learningNote.literalGloss should be written in English and give a short chunk-by-chunk gloss only when it helps explain the Spanish structure. Format each chunk as "Spanish chunk" = English meaning, with one chunk per line.
- learningNote.keyPhrase should highlight the most reusable Spanish phrase, collocation, or fixed expression from the sentence, and explain it in English.
- learningNote.canonicalUsage should explain in English the canonical or natural Spanish way to express the idea when it differs from direct English wording.
- learningNote.grammarFocus should explain in English one important grammar point only when it truly helps, and it must describe the actual form used in translatedText.

Rules:
- Keep each field concise.
- Use empty strings for fields that are not useful for the sentence.
- Prefer reusable phrases and natural wording over abstract grammar labels.
- All explanatory text must be in English. Spanish may appear only as the translated sentence or as quoted example phrases/chunks being explained.
- For learningNote.literalGloss, do not write slash-separated prose. Use newline-separated chunks instead.
- If there is no real grammar point worth teaching, leave learningNote.grammarFocus empty instead of forcing one.
- Do not repeat the same content across multiple fields unless needed for clarity.
`.trim();
const OPENAI_SENTENCE_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "sentence_translations",
    strict: true,
    schema: {
      type: "object",
      properties: {
        translations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              sentenceHash: {
                type: "string"
              },
              translatedText: {
                type: "string"
              },
              learningNote: {
                type: "object",
                properties: {
                  summary: {
                    type: "string"
                  },
                  literalGloss: {
                    type: "string"
                  },
                  keyPhrase: {
                    type: "string"
                  },
                  canonicalUsage: {
                    type: "string"
                  },
                  grammarFocus: {
                    type: "string"
                  }
                },
                required: [
                  "summary",
                  "literalGloss",
                  "keyPhrase",
                  "canonicalUsage",
                  "grammarFocus"
                ],
                additionalProperties: false
              }
            },
            required: ["sentenceHash", "translatedText", "learningNote"],
            additionalProperties: false
          }
        }
      },
      required: ["translations"],
      additionalProperties: false
    }
  }
} as const;

export type ProviderSentenceCandidate = {
  sentenceHash: string;
  sourceText: string;
};

export type ProviderSentenceTranslation = {
  sentenceHash: string;
  sourceText: string;
  translatedText: string;
  learningNote: SentenceLearningNote;
  model: string;
  promptVersion: string;
};

export type ProviderTranslationInput = {
  sourceLanguage: SupportedSourceLanguage;
  targetLanguage: SupportedTargetLanguage;
  candidates: readonly ProviderSentenceCandidate[];
};

export interface SentenceProviderClient {
  readonly providerName: ProviderName;
  translateSentences(
    input: ProviderTranslationInput
  ): Promise<ProviderSentenceTranslation[]>;
}

export function createSentenceProviderClient(
  provider: ProviderName,
  credentials: ProviderCredentials
): SentenceProviderClient | null {
  if (provider === "openai" && credentials.openAiApiKey) {
    return new OpenAiSentenceProviderClient(credentials.openAiApiKey);
  }

  return null;
}

class OpenAiSentenceProviderClient implements SentenceProviderClient {
  readonly providerName = "openai" as const;

  constructor(private readonly apiKey: string) {}

  async translateSentences(
    input: ProviderTranslationInput
  ): Promise<ProviderSentenceTranslation[]> {
    if (input.candidates.length === 0) {
      return [];
    }

    const response = await fetch(OPENAI_CHAT_COMPLETIONS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: DEFAULT_OPENAI_MODEL,
        temperature: 0.2,
        response_format: OPENAI_SENTENCE_RESPONSE_FORMAT,
        messages: [
          {
            role: "system",
            content: OPENAI_SENTENCE_SYSTEM_PROMPT
          },
          {
            role: "user",
            content: JSON.stringify({
              sourceLanguage: input.sourceLanguage,
              targetLanguage: input.targetLanguage,
              sentences: input.candidates.map((candidate) => ({
                sentenceHash: candidate.sentenceHash,
                sourceText: candidate.sourceText
              })),
              noteStyle: {
                summary:
                  "The most useful high-level takeaway in one short English sentence, ideally in a form like: To say X, use Y.",
                literalGloss:
                  "A selective chunk-by-chunk gloss in English when it clarifies Spanish structure. Use one chunk per line in the format: Spanish chunk = English meaning.",
                keyPhrase:
                  "A frequent reusable Spanish phrase or expression from the sentence, explained in English.",
                canonicalUsage:
                  "In English, explain how Spanish naturally phrases the idea when it differs from literal English.",
                grammarFocus:
                  "In English, explain one important grammar point only when it meaningfully helps the learner. Leave empty if none."
              }
            })
          }
        ]
      })
    });

    if (!response.ok) {
      const detail = await readFailedResponseDetail(response);
      throw new Error(
        `OpenAI request failed (${response.status} ${response.statusText}): ${detail}`
      );
    }

    const payload = (await response.json()) as unknown;
    const content = extractChatCompletionContent(payload);
    if (!content) {
      throw new Error("OpenAI response did not contain JSON content.");
    }

    const parsed = parseTranslationPayload(content);
    const byHash = new Map(
      parsed.map((entry) => [entry.sentenceHash, entry] as const)
    );

    const translations: ProviderSentenceTranslation[] = [];
    for (const candidate of input.candidates) {
      const translation = byHash.get(candidate.sentenceHash);
      if (!translation) {
        continue;
      }

      translations.push({
        sentenceHash: candidate.sentenceHash,
        sourceText: candidate.sourceText,
        translatedText: translation.translatedText,
        learningNote: translation.learningNote,
        model: DEFAULT_OPENAI_MODEL,
        promptVersion: OPENAI_SENTENCE_PROMPT_VERSION
      });
    }

    return translations;
  }
}

type ParsedTranslationRow = {
  sentenceHash: string;
  translatedText: string;
  learningNote: SentenceLearningNote;
};

function parseTranslationPayload(content: string): ParsedTranslationRow[] {
  let parsed: unknown = null;

  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(
      `OpenAI response JSON parsing failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.translations)) {
    throw new Error("OpenAI response did not include a translations array.");
  }

  const rows: ParsedTranslationRow[] = [];
  for (const row of parsed.translations) {
    if (!isRecord(row)) {
      continue;
    }

    const sentenceHash = readString(row.sentenceHash);
    const translatedText = readString(row.translatedText);
    const learningNote = parseLearningNote(row.learningNote);
    if (!sentenceHash || !translatedText || !learningNote) {
      continue;
    }

    rows.push({
      sentenceHash,
      translatedText,
      learningNote
    });
  }

  return rows;
}

function parseLearningNote(value: unknown): SentenceLearningNote | null {
  if (!isRecord(value)) {
    return null;
  }

  const learningNote = createSentenceLearningNote({
    summary: readString(value.summary) ?? undefined,
    literalGloss: readString(value.literalGloss) ?? undefined,
    keyPhrase: readString(value.keyPhrase) ?? undefined,
    canonicalUsage: readString(value.canonicalUsage) ?? undefined,
    grammarFocus: readString(value.grammarFocus) ?? undefined
  });

  return hasSentenceLearningNoteContent(learningNote) ? learningNote : null;
}

function extractChatCompletionContent(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return null;
  }

  for (const choice of payload.choices) {
    if (!isRecord(choice) || !isRecord(choice.message)) {
      continue;
    }

    const refusal = readString(choice.message.refusal);
    if (refusal) {
      throw new Error(`OpenAI refused the structured response: ${refusal}`);
    }

    const content = choice.message.content;
    if (typeof content === "string") {
      return content.trim();
    }

    if (!Array.isArray(content)) {
      continue;
    }

    for (const part of content) {
      if (!isRecord(part)) {
        continue;
      }

      const text = readString(part.text);
      if (text) {
        return text;
      }
    }
  }

  return null;
}

async function readFailedResponseDetail(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as unknown;
    if (!isRecord(payload)) {
      return response.statusText;
    }

    if (isRecord(payload.error)) {
      return readString(payload.error.message) ?? response.statusText;
    }

    return readString(payload.message) ?? response.statusText;
  } catch {
    return response.statusText;
  }
}
