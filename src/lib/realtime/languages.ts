export type Language = {
  code: string;
  label: string;
  flag: string;
  region: string;
};

/**
 * The 13 officially supported translation languages for gpt-realtime-translate.
 *
 * The model technically auto-detects 70+ input languages, but minor input
 * languages (Welsh, Yoruba, etc.) transcribe poorly in practice. We restrict
 * both source and target pickers to the well-tested set that's also
 * guaranteed as a translation output.
 *
 * Source: https://github.com/openai/openai-cookbook/blob/main/examples/voice_solutions/realtime_translation_guide.mdx
 */
export const LANGUAGES: readonly Language[] = [
  { code: "en", label: "English",    flag: "EN", region: "United States" },
  { code: "es", label: "Spanish",    flag: "ES", region: "Spain" },
  { code: "pt", label: "Portuguese", flag: "PT", region: "Brazil" },
  { code: "fr", label: "French",     flag: "FR", region: "France" },
  { code: "de", label: "German",     flag: "DE", region: "Germany" },
  { code: "it", label: "Italian",    flag: "IT", region: "Italy" },
  { code: "ja", label: "Japanese",   flag: "JA", region: "Japan" },
  { code: "ko", label: "Korean",     flag: "KO", region: "South Korea" },
  { code: "zh", label: "Chinese",    flag: "ZH", region: "Mandarin" },
  { code: "hi", label: "Hindi",      flag: "HI", region: "India" },
  { code: "id", label: "Indonesian", flag: "ID", region: "Indonesia" },
  { code: "vi", label: "Vietnamese", flag: "VI", region: "Vietnam" },
  { code: "ru", label: "Russian",    flag: "RU", region: "Russia" },
] as const;

export const INPUT_LANGUAGES: readonly Language[] = LANGUAGES;
export const OUTPUT_LANGUAGES: readonly Language[] = LANGUAGES;

export function findLanguage(code: string): Language {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

export function isOutputLanguage(code: string): boolean {
  return LANGUAGES.some((l) => l.code === code);
}
