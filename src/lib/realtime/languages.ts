export type Language = {
  /** Code passed to the API (target side) or used for display (source side). */
  code: string;
  /** English-language label shown in the dropdown. */
  label: string;
  /** Short tag rendered as the coloured badge. */
  flag: string;
  /** Subtitle line (country / region). */
  region: string;
  /** Whether the API can translate INTO this language. */
  isOutput: boolean;
};

/**
 * Languages supported by the gpt-realtime-translate model.
 *
 * - Input (source): all 74 entries — the model auto-detects.
 * - Output (target): the 13 entries flagged `isOutput: true`.
 *
 * Source: https://github.com/openai/openai-cookbook/blob/main/examples/voice_solutions/realtime_translation_guide.mdx
 */
export const LANGUAGES: readonly Language[] = [
  { code: "af",  label: "Afrikaans",      flag: "AF",  region: "South Africa",    isOutput: false },
  { code: "sq",  label: "Albanian",       flag: "SQ",  region: "Albania",         isOutput: false },
  { code: "ar",  label: "Arabic",         flag: "AR",  region: "MSA",             isOutput: false },
  { code: "hy",  label: "Armenian",       flag: "HY",  region: "Armenia",         isOutput: false },
  { code: "az",  label: "Azerbaijani",    flag: "AZ",  region: "Azerbaijan",      isOutput: false },
  { code: "eu",  label: "Basque",         flag: "EU",  region: "Spain",           isOutput: false },
  { code: "be",  label: "Belarusian",     flag: "BE",  region: "Belarus",         isOutput: false },
  { code: "bn",  label: "Bengali",        flag: "BN",  region: "Bangladesh",      isOutput: false },
  { code: "bs",  label: "Bosnian",        flag: "BS",  region: "Bosnia",          isOutput: false },
  { code: "bg",  label: "Bulgarian",      flag: "BG",  region: "Bulgaria",        isOutput: false },
  { code: "my",  label: "Burmese",        flag: "MY",  region: "Myanmar",         isOutput: false },
  { code: "ca",  label: "Catalan",        flag: "CA",  region: "Catalonia",       isOutput: false },
  { code: "zh",  label: "Chinese",        flag: "ZH",  region: "Mandarin",        isOutput: true  },
  { code: "hr",  label: "Croatian",       flag: "HR",  region: "Croatia",         isOutput: false },
  { code: "cs",  label: "Czech",          flag: "CS",  region: "Czechia",         isOutput: false },
  { code: "da",  label: "Danish",         flag: "DA",  region: "Denmark",         isOutput: false },
  { code: "nl",  label: "Dutch",          flag: "NL",  region: "Netherlands",     isOutput: false },
  { code: "dz",  label: "Dzongkha",       flag: "DZ",  region: "Bhutan",          isOutput: false },
  { code: "en",  label: "English",        flag: "EN",  region: "United States",   isOutput: true  },
  { code: "eo",  label: "Esperanto",      flag: "EO",  region: "—",               isOutput: false },
  { code: "et",  label: "Estonian",       flag: "ET",  region: "Estonia",         isOutput: false },
  { code: "fil", label: "Filipino",       flag: "FIL", region: "Philippines",     isOutput: false },
  { code: "fi",  label: "Finnish",        flag: "FI",  region: "Finland",         isOutput: false },
  { code: "fr",  label: "French",         flag: "FR",  region: "France",          isOutput: true  },
  { code: "gl",  label: "Galician",       flag: "GL",  region: "Galicia",         isOutput: false },
  { code: "ka",  label: "Georgian",       flag: "KA",  region: "Georgia",         isOutput: false },
  { code: "de",  label: "German",         flag: "DE",  region: "Germany",         isOutput: true  },
  { code: "el",  label: "Greek",          flag: "EL",  region: "Greece",          isOutput: false },
  { code: "gu",  label: "Gujarati",       flag: "GU",  region: "Gujarat",         isOutput: false },
  { code: "ht",  label: "Haitian Creole", flag: "HT",  region: "Haiti",           isOutput: false },
  { code: "haw", label: "Hawaiian",       flag: "HAW", region: "Hawaii",          isOutput: false },
  { code: "he",  label: "Hebrew",         flag: "HE",  region: "Israel",          isOutput: false },
  { code: "hi",  label: "Hindi",          flag: "HI",  region: "India",           isOutput: true  },
  { code: "hu",  label: "Hungarian",      flag: "HU",  region: "Hungary",         isOutput: false },
  { code: "id",  label: "Indonesian",     flag: "ID",  region: "Indonesia",       isOutput: true  },
  { code: "it",  label: "Italian",        flag: "IT",  region: "Italy",           isOutput: true  },
  { code: "ja",  label: "Japanese",       flag: "JA",  region: "Japan",           isOutput: true  },
  { code: "jv",  label: "Javanese",       flag: "JV",  region: "Java",            isOutput: false },
  { code: "kk",  label: "Kazakh",         flag: "KK",  region: "Kazakhstan",      isOutput: false },
  { code: "ko",  label: "Korean",         flag: "KO",  region: "South Korea",     isOutput: true  },
  { code: "ku",  label: "Kurdish",        flag: "KU",  region: "Kurdistan",       isOutput: false },
  { code: "la",  label: "Latin",          flag: "LA",  region: "—",               isOutput: false },
  { code: "lv",  label: "Latvian",        flag: "LV",  region: "Latvia",          isOutput: false },
  { code: "lt",  label: "Lithuanian",     flag: "LT",  region: "Lithuania",       isOutput: false },
  { code: "mk",  label: "Macedonian",     flag: "MK",  region: "North Macedonia", isOutput: false },
  { code: "ms",  label: "Malay",          flag: "MS",  region: "Malaysia",        isOutput: false },
  { code: "ml",  label: "Malayalam",      flag: "ML",  region: "Kerala",          isOutput: false },
  { code: "mi",  label: "Maori",          flag: "MI",  region: "New Zealand",     isOutput: false },
  { code: "mn",  label: "Mongolian",      flag: "MN",  region: "Mongolia",        isOutput: false },
  { code: "ne",  label: "Nepali",         flag: "NE",  region: "Nepal",           isOutput: false },
  { code: "no",  label: "Norwegian",      flag: "NO",  region: "Norway",          isOutput: false },
  { code: "nn",  label: "Nynorsk",        flag: "NN",  region: "Norway",          isOutput: false },
  { code: "fa",  label: "Persian",        flag: "FA",  region: "Iran",            isOutput: false },
  { code: "pl",  label: "Polish",         flag: "PL",  region: "Poland",          isOutput: false },
  { code: "pt",  label: "Portuguese",     flag: "PT",  region: "Brazil",          isOutput: true  },
  { code: "pa",  label: "Punjabi",        flag: "PA",  region: "Punjab",          isOutput: false },
  { code: "ro",  label: "Romanian",       flag: "RO",  region: "Romania",         isOutput: false },
  { code: "ru",  label: "Russian",        flag: "RU",  region: "Russia",          isOutput: true  },
  { code: "sr",  label: "Serbian",        flag: "SR",  region: "Serbia",          isOutput: false },
  { code: "sn",  label: "Shona",          flag: "SN",  region: "Zimbabwe",        isOutput: false },
  { code: "sk",  label: "Slovak",         flag: "SK",  region: "Slovakia",        isOutput: false },
  { code: "sl",  label: "Slovenian",      flag: "SL",  region: "Slovenia",        isOutput: false },
  { code: "es",  label: "Spanish",        flag: "ES",  region: "Spain",           isOutput: true  },
  { code: "sw",  label: "Swahili",        flag: "SW",  region: "East Africa",     isOutput: false },
  { code: "sv",  label: "Swedish",        flag: "SV",  region: "Sweden",          isOutput: false },
  { code: "tl",  label: "Tagalog",        flag: "TL",  region: "Philippines",     isOutput: false },
  { code: "te",  label: "Telugu",         flag: "TE",  region: "Andhra Pradesh",  isOutput: false },
  { code: "th",  label: "Thai",           flag: "TH",  region: "Thailand",        isOutput: false },
  { code: "tr",  label: "Turkish",        flag: "TR",  region: "Turkey",          isOutput: false },
  { code: "uk",  label: "Ukrainian",      flag: "UK",  region: "Ukraine",         isOutput: false },
  { code: "uz",  label: "Uzbek",          flag: "UZ",  region: "Uzbekistan",      isOutput: false },
  { code: "vi",  label: "Vietnamese",     flag: "VI",  region: "Vietnam",         isOutput: true  },
  { code: "cy",  label: "Welsh",          flag: "CY",  region: "Wales",           isOutput: false },
  { code: "yo",  label: "Yoruba",         flag: "YO",  region: "Nigeria",         isOutput: false },
] as const;

export const INPUT_LANGUAGES: readonly Language[] = LANGUAGES;
export const OUTPUT_LANGUAGES: readonly Language[] = LANGUAGES.filter((l) => l.isOutput);

export function findLanguage(code: string): Language {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES.find((l) => l.code === "en")!;
}

export function isOutputLanguage(code: string): boolean {
  return OUTPUT_LANGUAGES.some((l) => l.code === code);
}
