import type {
  ProviderName,
  SupportedSourceLanguage,
  SupportedTargetLanguage
} from "@immersionkit/shared";

import type { ProviderCredentials } from "./settings";
import { isRecord, readString } from "./storage";

const OPENAI_CHAT_COMPLETIONS_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const OPENAI_SENTENCE_PROMPT_VERSION = "openai-sentence-v1";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

export type ProviderSentenceCandidate = {
  sentenceHash: string;
  sourceText: string;
};

export type ProviderSentenceTranslation = {
  sentenceHash: string;
  sourceText: string;
  translatedText: string;
  grammarNote: string;
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
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Translate English sentences into Spanish and return concise grammar notes. Return strict JSON with a translations array."
          },
          {
            role: "user",
            content: JSON.stringify({
              sourceLanguage: input.sourceLanguage,
              targetLanguage: input.targetLanguage,
              translations: input.candidates.map((candidate) => ({
                sentenceHash: candidate.sentenceHash,
                sourceText: candidate.sourceText
              })),
              outputSchema: {
                translations: [
                  {
                    sentenceHash: "string",
                    translatedText: "string",
                    grammarNote: "string"
                  }
                ]
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
        grammarNote: translation.grammarNote,
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
  grammarNote: string;
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
    const grammarNote = readString(row.grammarNote);
    if (!sentenceHash || !translatedText || !grammarNote) {
      continue;
    }

    rows.push({
      sentenceHash,
      translatedText,
      grammarNote
    });
  }

  return rows;
}

function extractChatCompletionContent(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return null;
  }

  for (const choice of payload.choices) {
    if (!isRecord(choice) || !isRecord(choice.message)) {
      continue;
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

