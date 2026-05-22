export type SpanishVerbPerson =
  | "first-singular"
  | "second-singular"
  | "third-singular"
  | "first-plural"
  | "third-plural";

export type SpanishVerbForm =
  | { mood: "present-indicative"; person: SpanishVerbPerson }
  | { mood: "affirmative-tu-imperative" }
  | { mood: "gerund" };

export const SPANISH_SUBJECT_PRONOUN_BY_PERSON: Record<
  SpanishVerbPerson,
  string
> = {
  "first-singular": "yo",
  "second-singular": "tú",
  "third-singular": "él",
  "first-plural": "nosotros",
  "third-plural": "ellos"
};

const PRESENT_IRREGULAR: Record<
  string,
  Partial<Record<SpanishVerbPerson, string>>
> = {
  caber: {
    "first-singular": "quepo"
  },
  caer: {
    "first-singular": "caigo"
  },
  dar: {
    "first-singular": "doy"
  },
  decir: {
    "first-singular": "digo",
    "second-singular": "dices",
    "third-singular": "dice",
    "first-plural": "decimos",
    "third-plural": "dicen"
  },
  estar: {
    "first-singular": "estoy",
    "second-singular": "estás",
    "third-singular": "está",
    "first-plural": "estamos",
    "third-plural": "están"
  },
  haber: {
    "first-singular": "he",
    "second-singular": "has",
    "third-singular": "ha",
    "first-plural": "hemos",
    "third-plural": "han"
  },
  hacer: {
    "first-singular": "hago"
  },
  ir: {
    "first-singular": "voy",
    "second-singular": "vas",
    "third-singular": "va",
    "first-plural": "vamos",
    "third-plural": "van"
  },
  oir: {
    "first-singular": "oigo",
    "second-singular": "oyes",
    "third-singular": "oye",
    "first-plural": "oímos",
    "third-plural": "oyen"
  },
  poner: {
    "first-singular": "pongo"
  },
  salir: {
    "first-singular": "salgo"
  },
  saber: {
    "first-singular": "sé"
  },
  ser: {
    "first-singular": "soy",
    "second-singular": "eres",
    "third-singular": "es",
    "first-plural": "somos",
    "third-plural": "son"
  },
  tener: {
    "first-singular": "tengo",
    "second-singular": "tienes",
    "third-singular": "tiene",
    "first-plural": "tenemos",
    "third-plural": "tienen"
  },
  traer: {
    "first-singular": "traigo"
  },
  valer: {
    "first-singular": "valgo"
  },
  venir: {
    "first-singular": "vengo",
    "second-singular": "vienes",
    "third-singular": "viene",
    "first-plural": "venimos",
    "third-plural": "vienen"
  },
  ver: {
    "first-singular": "veo",
    "second-singular": "ves",
    "third-singular": "ve",
    "first-plural": "vemos",
    "third-plural": "ven"
  }
};

const STEM_CHANGE_BY_INFINITIVE: Record<string, "e-ie" | "e-i" | "o-ue" | "u-ue"> = {
  acordar: "o-ue",
  acostar: "o-ue",
  almorzar: "o-ue",
  aprobar: "o-ue",
  cerrar: "e-ie",
  comenzar: "e-ie",
  comprobar: "o-ue",
  conseguir: "e-i",
  contar: "o-ue",
  convertir: "e-ie",
  costar: "o-ue",
  defender: "e-ie",
  demostrar: "o-ue",
  dormir: "o-ue",
  elegir: "e-i",
  empezar: "e-ie",
  encontrar: "o-ue",
  entender: "e-ie",
  jugar: "u-ue",
  mentir: "e-ie",
  morir: "o-ue",
  mostrar: "o-ue",
  obtener: "e-ie",
  pensar: "e-ie",
  perder: "e-ie",
  poder: "o-ue",
  preferir: "e-ie",
  probar: "o-ue",
  querer: "e-ie",
  recordar: "o-ue",
  referir: "e-ie",
  resolver: "o-ue",
  sentir: "e-ie",
  seguir: "e-i",
  servir: "e-i",
  sonar: "o-ue",
  sugerir: "e-ie",
  tener: "e-ie",
  venir: "e-ie",
  volver: "o-ue"
};

const GERUND_IRREGULAR: Record<string, string> = {
  caer: "cayendo",
  construir: "construyendo",
  decir: "diciendo",
  dormir: "durmiendo",
  elegir: "eligiendo",
  incluir: "incluyendo",
  ir: "yendo",
  leer: "leyendo",
  morir: "muriendo",
  oir: "oyendo",
  pedir: "pidiendo",
  poder: "pudiendo",
  preferir: "prefiriendo",
  producir: "produciendo",
  seguir: "siguiendo",
  sentir: "sintiendo",
  servir: "sirviendo",
  traer: "trayendo",
  venir: "viniendo"
};

const TU_IMPERATIVE_IRREGULAR: Record<string, string> = {
  decir: "di",
  hacer: "haz",
  ir: "ve",
  poner: "pon",
  salir: "sal",
  ser: "sé",
  tener: "ten",
  venir: "ven"
};

const PRESENT_ENDINGS: Record<
  "ar" | "er" | "ir",
  Record<SpanishVerbPerson, string>
> = {
  ar: {
    "first-singular": "o",
    "second-singular": "as",
    "third-singular": "a",
    "first-plural": "amos",
    "third-plural": "an"
  },
  er: {
    "first-singular": "o",
    "second-singular": "es",
    "third-singular": "e",
    "first-plural": "emos",
    "third-plural": "en"
  },
  ir: {
    "first-singular": "o",
    "second-singular": "es",
    "third-singular": "e",
    "first-plural": "imos",
    "third-plural": "en"
  }
};

export function conjugateSpanishVerb(
  infinitive: string,
  form: SpanishVerbForm
): string | null {
  const normalized = infinitive.trim().toLowerCase();
  const ending = readSpanishVerbEnding(normalized);
  if (!ending) {
    return null;
  }

  if (form.mood === "present-indicative") {
    return conjugatePresentIndicative(normalized, ending, form.person);
  }

  if (form.mood === "affirmative-tu-imperative") {
    return conjugateTuImperative(normalized, ending);
  }

  return conjugateGerund(normalized, ending);
}

function conjugatePresentIndicative(
  infinitive: string,
  ending: "ar" | "er" | "ir",
  person: SpanishVerbPerson
): string {
  const irregular = PRESENT_IRREGULAR[infinitive]?.[person];
  if (irregular) {
    return irregular;
  }

  const stem =
    person === "first-plural"
      ? infinitive.slice(0, -2)
      : applyStemChange(infinitive.slice(0, -2), STEM_CHANGE_BY_INFINITIVE[infinitive]);
  return applyPresentSpellingAdjustment(infinitive, stem, person) +
    PRESENT_ENDINGS[ending][person];
}

function conjugateTuImperative(
  infinitive: string,
  ending: "ar" | "er" | "ir"
): string {
  const irregular = TU_IMPERATIVE_IRREGULAR[infinitive];
  if (irregular) {
    return irregular;
  }

  return conjugatePresentIndicative(infinitive, ending, "third-singular");
}

function conjugateGerund(infinitive: string, ending: "ar" | "er" | "ir"): string {
  const irregular = GERUND_IRREGULAR[infinitive];
  if (irregular) {
    return irregular;
  }

  const stem = infinitive.slice(0, -2);
  return ending === "ar" ? `${stem}ando` : `${stem}iendo`;
}

function applyStemChange(
  stem: string,
  change: "e-ie" | "e-i" | "o-ue" | "u-ue" | undefined
): string {
  if (!change) {
    return stem;
  }

  const [from, to] = change.split("-") as [string, string];
  const index = stem.lastIndexOf(from);
  if (index < 0) {
    return stem;
  }

  return `${stem.slice(0, index)}${to}${stem.slice(index + from.length)}`;
}

function applyPresentSpellingAdjustment(
  infinitive: string,
  stem: string,
  person: SpanishVerbPerson
): string {
  if (person !== "first-singular") {
    return stem;
  }

  if (infinitive.endsWith("cer") || infinitive.endsWith("cir")) {
    if (infinitive === "hacer" || infinitive === "decir") {
      return stem;
    }
    return `${stem.slice(0, -1)}zc`;
  }

  if (infinitive.endsWith("ger") || infinitive.endsWith("gir")) {
    return `${stem.slice(0, -1)}j`;
  }

  if (infinitive.endsWith("guir")) {
    return `${stem.slice(0, -2)}g`;
  }

  if (infinitive.endsWith("uir")) {
    return `${stem}y`;
  }

  return stem;
}

function readSpanishVerbEnding(value: string): "ar" | "er" | "ir" | null {
  if (value.endsWith("ar")) {
    return "ar";
  }

  if (value.endsWith("er")) {
    return "er";
  }

  return value.endsWith("ir") ? "ir" : null;
}
