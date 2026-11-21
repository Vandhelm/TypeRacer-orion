// CONF-05 : critères mesurables des trois niveaux de complexité du dictionnaire (facile, moyen, difficile).
// Les seuils sont documentés dans docs/ARCHITECTURE.md, « Complexité du texte » ; complexity.test.ts mesure le
// dictionnaire de chaque langue (LEXICON) et vérifie qu'il les respecte et que les niveaux sont ordonnés.
import type { LANGUAGES, LEVELS } from "../../rooms/settings";
import { FREQUENT_WORDS } from "./frequent";

export type WordMetrics = {
  /** longueur moyenne d'un mot, en caractères */
  meanLength: number;
  minLength: number;
  maxLength: number;
  /** part des mots de 10 caractères ou plus */
  longShare: number;
  /** part des mots de la liste de référence des mots très fréquents (FREQUENT_WORDS) */
  frequentShare: number;
  /** part des mots qui ont une lettre accentuée, un signe (apostrophe, tiret) ou une lettre rare de la langue */
  specialShare: number;
};
type Metric = keyof WordMetrics;
type Language = (typeof LANGUAGES)[number];
type Level = (typeof LEVELS)[number];

/** Lettres rares : moins de 1 % des lettres d'un texte courant de la langue (tables de fréquence des lettres). */
const RARE_LETTERS: Record<Language, RegExp> = { fr: /[kwxyzj]/, en: /[vkjxqz]/ };
const LONG_WORD = 10;

const frequent = Object.fromEntries(
  Object.entries(FREQUENT_WORDS).map(([language, list]) => [language, new Set(list.split(/\s+/).filter(Boolean))]),
) as Record<Language, Set<string>>;

const isSpecial = (word: string, language: Language) => /[^a-z]/.test(word) || RARE_LETTERS[language].test(word);

export function measureWords(words: readonly string[], language: Language): WordMetrics {
  if (!words.length) return { meanLength: 0, minLength: 0, maxLength: 0, longShare: 0, frequentShare: 0, specialShare: 0 };
  const lower = words.map((word) => word.toLowerCase());
  const lengths = lower.map((word) => [...word].length);
  const share = (keep: (word: string, i: number) => boolean) => lower.filter(keep).length / words.length;
  return {
    meanLength: lengths.reduce((sum, n) => sum + n, 0) / words.length,
    minLength: Math.min(...lengths),
    maxLength: Math.max(...lengths),
    longShare: share((_, i) => lengths[i]! >= LONG_WORD),
    frequentShare: share((word) => frequent[language].has(word)),
    specialShare: share((word) => isSpecial(word, language)),
  };
}

type Bound = { min?: number; max?: number };

/** Seuils de chaque niveau, les mêmes pour le français et l'anglais. */
export const COMPLEXITY: Record<Level, { label: string } & Partial<Record<Metric, Bound>>> = {
  common: {
    label: "facile",
    meanLength: { max: 4.5 },
    maxLength: { max: 8 },
    longShare: { max: 0 },
    frequentShare: { min: 0.8 },
    specialShare: { max: 0.15 },
  },
  rich: {
    label: "moyen",
    meanLength: { min: 5.5, max: 8.5 },
    minLength: { min: 3 },
    maxLength: { max: 12 },
    longShare: { max: 0.15 },
    frequentShare: { max: 0.25 },
    specialShare: { max: 0.3 },
  },
  expert: {
    label: "difficile",
    meanLength: { min: 9 },
    minLength: { min: 6 },
    longShare: { min: 0.5 },
    frequentShare: { max: 0.02 },
    specialShare: { min: 0.2 },
  },
};

/** Sens de la difficulté de chaque critère : il doit croître (ou décroître) strictement de facile à difficile. */
export const LEVEL_METRICS: { key: Metric; harder: "higher" | "lower" }[] = [
  { key: "meanLength", harder: "higher" },
  { key: "minLength", harder: "higher" },
  { key: "maxLength", harder: "higher" },
  { key: "longShare", harder: "higher" },
  { key: "frequentShare", harder: "lower" },
  { key: "specialShare", harder: "higher" },
];

/** Les critères dont la mesure sort des seuils du niveau ; vide si le niveau les respecte tous. */
export function checkLevel(metrics: WordMetrics, level: Level): Metric[] {
  const { label: _label, ...bounds } = COMPLEXITY[level];
  return (Object.entries(bounds) as [Metric, Bound][]).filter(
    ([key, { min, max }]) => (min !== undefined && metrics[key] < min) || (max !== undefined && metrics[key] > max),
  ).map(([key]) => key);
}
