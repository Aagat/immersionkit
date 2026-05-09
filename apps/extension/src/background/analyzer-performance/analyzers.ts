import { hashSentence, normalizeToken, tokenizeForLookup } from "@immersionkit/shared";

import type {
  AnalyzerEngineFactory,
  AnalyzerId,
  AnalyzerTokenSnapshot,
  SentenceAnalysisEngine,
  SentenceAnalyzerSnapshot
} from "./types";

type UnknownRecord = Record<string, unknown>;

type CompromiseDoc = {
  terms?: () => {
    json?: () => unknown;
  };
  chunks?: () => {
    out?: (format?: string) => unknown;
  };
  match?: (pattern: string) => {
    out?: (format?: string) => unknown;
  };
};

function normalizeTagList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((value): value is string => typeof value === "string");
  }

  if (raw && typeof raw === "object") {
    return Object.keys(raw as UnknownRecord);
  }

  return [];
}

function extractCompromiseTokens(doc: CompromiseDoc, sentence: string): AnalyzerTokenSnapshot[] {
  const termsJson = doc.terms?.()?.json?.();
  const tokens: AnalyzerTokenSnapshot[] = [];

  if (Array.isArray(termsJson)) {
    for (const item of termsJson) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const record = item as UnknownRecord;
      const nestedTerms = record.terms;

      if (Array.isArray(nestedTerms)) {
        for (const nestedTerm of nestedTerms) {
          if (!nestedTerm || typeof nestedTerm !== "object") {
            continue;
          }

          const nestedRecord = nestedTerm as UnknownRecord;
          const text = typeof nestedRecord.text === "string" ? nestedRecord.text : null;
          if (!text) {
            continue;
          }

          const tags = normalizeTagList(nestedRecord.tags);
          tokens.push({
            text,
            normalized: normalizeToken(text),
            pos: pickCoarsePosFromCompromiseTags(tags),
            tags: tags.sort()
          });
        }
        continue;
      }

      const text = typeof record.text === "string" ? record.text : null;
      if (!text) {
        continue;
      }

      const tags = normalizeTagList(record.tags);
      tokens.push({
        text,
        normalized: normalizeToken(text),
        pos: pickCoarsePosFromCompromiseTags(tags),
        tags: tags.sort()
      });
    }
  }

  if (tokens.length > 0) {
    return tokens.filter((token) => token.normalized.length > 0);
  }

  return tokenizeForLookup(sentence).map((token) => ({
    text: token.raw,
    normalized: token.normalized,
    pos: "unknown",
    tags: []
  }));
}

function safeArrayOut(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => item.length > 0);
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values));
}

function extractCompromisePhraseCandidates(doc: CompromiseDoc): string[] {
  const chunks = safeArrayOut(doc.chunks?.()?.out?.("array"));
  const adjectiveNounMatches = safeArrayOut(
    doc.match?.("#Adjective #Noun+")?.out?.("array")
  );
  const nounPrepositionNounMatches = safeArrayOut(
    doc.match?.("#Noun+ #Preposition #Determiner? #Adjective* #Noun+")?.out?.("array")
  );

  return uniqueValues([...chunks, ...adjectiveNounMatches, ...nounPrepositionNounMatches]).slice(
    0,
    16
  );
}

function pickCoarsePosFromCompromiseTags(tags: string[]): string {
  const normalized = tags.map((tag) => tag.toLowerCase());

  if (normalized.some((tag) => tag.includes("noun"))) {
    return "noun";
  }

  if (normalized.some((tag) => tag.includes("verb"))) {
    return "verb";
  }

  if (normalized.some((tag) => tag.includes("adjective"))) {
    return "adjective";
  }

  if (normalized.some((tag) => tag.includes("adverb"))) {
    return "adverb";
  }

  if (normalized.some((tag) => tag.includes("pronoun"))) {
    return "pronoun";
  }

  if (normalized.some((tag) => tag.includes("determiner"))) {
    return "determiner";
  }

  if (normalized.some((tag) => tag.includes("preposition"))) {
    return "preposition";
  }

  return normalized[0] ?? "unknown";
}

function buildSnapshot(
  analyzerId: AnalyzerId,
  sentence: string,
  tokens: AnalyzerTokenSnapshot[],
  phraseCandidates: string[]
): SentenceAnalyzerSnapshot {
  return {
    analyzerId,
    sentence,
    sentenceHash: hashSentence(sentence),
    tokenCount: tokens.length,
    tokens,
    phraseCandidates: uniqueValues(phraseCandidates)
  };
}

async function createCompromiseEngine(
  analyzerId: "compromise-three",
  loadModule: () => Promise<{
    default: (text: string) => CompromiseDoc;
  }>
): Promise<SentenceAnalysisEngine> {
  const module = await loadModule();

  const nlp = module.default;

  return {
    analyzerId,
    analyzeSentence(sentence: string): SentenceAnalyzerSnapshot {
      const doc = nlp(sentence);
      const tokens = extractCompromiseTokens(doc, sentence);
      const phraseCandidates = extractCompromisePhraseCandidates(doc);
      return buildSnapshot(analyzerId, sentence, tokens, phraseCandidates);
    }
  };
}

async function createWinkEngine(): Promise<SentenceAnalysisEngine> {
  const winkModule = (await import("wink-nlp")) as unknown as {
    default: (model: unknown) => {
      its: {
        normal: unknown;
        pos: unknown;
      };
      readDoc: (input: string) => unknown;
    };
  };

  const modelModule = (await import("wink-eng-lite-web-model")) as {
    default: unknown;
  };

  const winkNlp = winkModule.default;
  const nlp = winkNlp(modelModule.default);

  return {
    analyzerId: "wink-nlp",
    analyzeSentence(sentence: string): SentenceAnalyzerSnapshot {
      const doc = nlp.readDoc(sentence) as {
        tokens: () => {
          out: (kind?: unknown) => unknown;
        };
        entities?: () => {
          out: () => unknown;
        };
      };

      const tokenCursor = doc.tokens();
      const tokenTexts = safeStringArray(tokenCursor.out());
      const tokenNormals = safeStringArray(tokenCursor.out(nlp.its.normal));
      const tokenPos = safeStringArray(tokenCursor.out(nlp.its.pos));

      const tokens: AnalyzerTokenSnapshot[] = tokenTexts.map((text, index) => ({
        text,
        normalized: tokenNormals[index] ?? normalizeToken(text),
        pos: normalizePosTag(tokenPos[index]),
        tags: tokenPos[index] ? [String(tokenPos[index])] : []
      }));

      const phraseCandidates = safeStringArray(doc.entities?.()?.out() ?? []);

      return buildSnapshot("wink-nlp", sentence, tokens, phraseCandidates);
    }
  };
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry : null))
    .filter((entry): entry is string => entry !== null);
}

function normalizePosTag(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    return "unknown";
  }

  const lower = value.toLowerCase();

  if (lower.startsWith("nn")) {
    return "noun";
  }

  if (lower.startsWith("vb")) {
    return "verb";
  }

  if (lower.startsWith("jj")) {
    return "adjective";
  }

  if (lower.startsWith("rb")) {
    return "adverb";
  }

  return lower;
}

export function listAvailableAnalyzerFactories(includeWinkNlp: boolean): AnalyzerEngineFactory[] {
  const factories: AnalyzerEngineFactory[] = [
    {
      analyzerId: "compromise-three",
      create: () =>
        createCompromiseEngine(
          "compromise-three",
          () =>
            import("compromise/three") as Promise<{
              default: (text: string) => CompromiseDoc;
            }>
        )
    }
  ];

  if (includeWinkNlp) {
    factories.push({
      analyzerId: "wink-nlp",
      create: () => createWinkEngine()
    });
  }

  return factories;
}
