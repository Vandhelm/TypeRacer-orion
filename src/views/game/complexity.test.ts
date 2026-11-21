import { describe, expect, test } from "bun:test";
import en from "../../i18n/locales/en.json";
import fr from "../../i18n/locales/fr.json";
import { LEVELS } from "../../rooms/settings";
import { COMPLEXITY, LEVEL_METRICS, checkLevel, measureWords } from "./complexity";
import { LEXICON } from "./lexicon";

const LANGUAGES = ["fr", "en"] as const;
const words = (language: (typeof LANGUAGES)[number], level: (typeof LEVELS)[number]) => LEXICON[language][level].split(" ");

describe("CONF-05 — the metrics measure a list of words", () => {
  test("lengths count characters, not UTF-16 units or bytes", () => {
    const m = measureWords(["thé", "éphémère"], "fr");
    expect(m.meanLength).toBe(5.5);
    expect(m.minLength).toBe(3);
    expect(m.maxLength).toBe(8);
  });

  test("long words are those of 10 characters or more", () => {
    expect(measureWords(["abcdefghi", "abcdefghij"], "en").longShare).toBe(0.5);
  });

  test("a frequent word is one of the reference list of its language, whatever its case", () => {
    expect(measureWords(["The", "palimpsest"], "en").frequentShare).toBe(0.5);
    expect(measureWords(["the"], "fr").frequentShare).toBe(0);
  });

  test("a special word has an accented letter, a sign or a rare letter of its language", () => {
    expect(measureWords(["café", "kayak", "plan"], "fr").specialShare).toBeCloseTo(2 / 3);
    expect(measureWords(["l'été", "bas-côté"], "fr").specialShare).toBe(1);
    // « v » est rare en anglais (moins de 1 % des lettres), pas en français
    expect(measureWords(["vase"], "en").specialShare).toBe(1);
    expect(measureWords(["vase"], "fr").specialShare).toBe(0);
  });

  test("an empty list measures zero everywhere instead of NaN", () => {
    const m = measureWords([], "fr");
    expect(Object.values(m).every((value) => value === 0)).toBe(true);
  });
});

describe("CONF-05 — checkLevel reports each threshold a list breaks", () => {
  test("long, rare words are not easy", () => {
    const broken = checkLevel(measureWords(["anticonstitutionnellement", "kaléidoscope"], "fr"), "common");
    expect(broken).toContain("meanLength");
    expect(broken).toContain("maxLength");
    expect(broken).toContain("longShare");
    expect(broken).toContain("frequentShare");
  });

  test("short, frequent words are not hard", () => {
    const broken = checkLevel(measureWords(["le", "la", "et"], "fr"), "expert");
    expect(broken).toEqual(expect.arrayContaining(["meanLength", "minLength", "longShare", "frequentShare", "specialShare"]));
  });

  test("a list inside every threshold breaks none", () => {
    expect(checkLevel(measureWords(["le", "la", "et", "un", "de"], "fr"), "common")).toEqual([]);
  });
});

describe("CONF-05 — each dictionary respects the documented thresholds of its level", () => {
  for (const language of LANGUAGES) {
    for (const level of LEVELS) {
      test(`${language} ${level} (${COMPLEXITY[level].label})`, () => {
        const m = measureWords(words(language, level), language);
        expect({ language, level, broken: checkLevel(m, level), m }).toMatchObject({ broken: [] });
      });
    }
  }
});

describe("CONF-05 — the levels are ordered: easy < medium < hard", () => {
  for (const language of LANGUAGES) {
    const [easy, medium, hard] = LEVELS.map((level) => measureWords(words(language, level), language));
    for (const metric of LEVEL_METRICS) {
      test(`${language}: ${metric.key} ${metric.harder === "higher" ? "grows" : "falls"} from easy to hard`, () => {
        const values = [easy![metric.key], medium![metric.key], hard![metric.key]];
        const ordered = metric.harder === "higher" ? [...values].sort((a, b) => a - b) : [...values].sort((a, b) => b - a);
        expect(values).toEqual(ordered);
        // facile et difficile se distinguent sur chaque critère ; moyen peut toucher un plancher (aucun mot fréquent)
        expect(values[0]).not.toBe(values[2]);
      });
    }

    test(`${language}: the mean word length is strictly ordered on all three levels`, () => {
      expect(easy!.meanLength).toBeLessThan(medium!.meanLength);
      expect(medium!.meanLength).toBeLessThan(hard!.meanLength);
    });
  }

  test("no word is shared between two levels of the same language", () => {
    for (const language of LANGUAGES) {
      const [easy, medium, hard] = LEVELS.map((level) => new Set(words(language, level)));
      const shared = [...easy!].filter((w) => medium!.has(w) || hard!.has(w)).concat([...medium!].filter((w) => hard!.has(w)));
      expect({ language, shared }).toEqual({ language, shared: [] });
    }
  });
});

describe("CONF-05 — the interface names the levels easy, medium and hard", () => {
  const LABELS = { fr: ["facile", "moyen", "difficile"], en: ["easy", "medium", "hard"] };
  for (const [language, locale] of [["fr", fr], ["en", en]] as const) {
    test(`${language}: room settings, room explorer and profile use the same three names`, () => {
      const names = (pick: (level: (typeof LEVELS)[number]) => string) => LEVELS.map((level) => pick(level).toLowerCase());
      expect(names((level) => locale.room[level])).toEqual(LABELS[language]);
      expect(names((level) => locale.rooms.explorer.levels[level])).toEqual(LABELS[language]);
      expect(names((level) => locale.profile.levels[level])).toEqual(LABELS[language]);
    });
  }
});
