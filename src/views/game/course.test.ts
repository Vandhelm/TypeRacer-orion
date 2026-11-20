import { describe, expect, test } from "bun:test";
import { DEFAULT_SETTINGS } from "../../rooms/settings";
import { seededRandom } from "../../rooms/text";
import { buildWords, type CourseSettings } from "./course";
import { LEXICON, QUOTES } from "./lexicon";

const settings = (patch: Partial<CourseSettings> = {}): CourseSettings => ({ ...DEFAULT_SETTINGS, ...patch });
const PASSAGE = "Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do.";

describe("CONF-03 — coherent mode types the passage picked by the server", () => {
  test("the words are the passage, in order", () => {
    expect(buildWords(settings({ textType: "coherent", length: "long" }), Math.random, PASSAGE).join(" ")).toBe(PASSAGE);
  });

  test("a passage longer than the requested length is cut at that length, from its start", () => {
    const words = buildWords(settings({ textType: "coherent", length: "very-short" }), Math.random, PASSAGE);
    expect(words).toEqual(PASSAGE.split(" ").slice(0, 10));
  });

  test("the free word count applies too", () => {
    expect(buildWords(settings({ textType: "coherent", length: "other", wordCount: 3 }), Math.random, PASSAGE)).toEqual(["Alice", "was", "beginning"]);
  });

  test("composition settings still apply to the passage (no accents)", () => {
    const words = buildWords(settings({ textType: "coherent", accents: false }), Math.random, "Le cœur a ses raisons, dit-il, à l'été.");
    expect(words.join(" ")).toBe("Le coeur a ses raisons, dit-il, a l'ete.");
  });

  test("a passage is ignored outside coherent mode", () => {
    const words = buildWords(settings({ textType: "words", length: "short" }), Math.random, PASSAGE);
    expect(words.join(" ")).not.toBe(PASSAGE);
  });
});

describe("CONF-03 — random mode draws its words from the dictionary", () => {
  for (const language of ["fr", "en"] as const) {
    for (const level of ["common", "rich", "expert"] as const) {
      test(`${language} ${level}: every word is a dictionary word of that language and level`, () => {
        const dictionary = new Set(LEXICON[language][level].split(" "));
        const words = buildWords(settings({ textType: "words", language, level, length: "long", punctuation: false, numbers: false, specials: false }));
        expect(words).toHaveLength(100);
        expect(words.every((word) => dictionary.has(word))).toBe(true);
      });
    }
  }

  test("the dictionary is not a handful of words", () => {
    for (const language of ["fr", "en"] as const) {
      for (const level of ["common", "rich", "expert"] as const) expect(new Set(LEXICON[language][level].split(" ")).size).toBeGreaterThanOrEqual(100);
    }
  });

  test("two draws differ: the words are random, not a fixed text", () => {
    const draw = () => buildWords(settings({ textType: "words", length: "medium" })).join(" ");
    expect(draw()).not.toBe(draw());
  });
});

describe("CONF-03 — every member of the room types the same text", () => {
  const cases: Partial<CourseSettings>[] = [
    { textType: "words", punctuation: true },
    { textType: "coherent", numbers: true, specials: true },
    { textType: "quote" },
  ];
  for (const patch of cases) {
    test(`the seed drawn by the server gives the same words on two clients (${JSON.stringify(patch)})`, () => {
      const draw = () => buildWords(settings({ length: "long", ...patch }), seededRandom(418_2026), PASSAGE).join(" ");
      expect(draw()).toBe(draw());
    });
  }

  test("two seeds give two random texts", () => {
    const draw = (seed: number) => buildWords(settings({ textType: "words", length: "long" }), seededRandom(seed)).join(" ");
    expect(draw(1)).not.toBe(draw(2));
  });

  test("the generator stays in [0, 1)", () => {
    const random = seededRandom(-7);
    for (let i = 0; i < 1000; i++) {
      const value = random();
      expect(value >= 0 && value < 1).toBe(true);
    }
  });
});

// CONF-04 : très court, court, moyen, long et une longueur libre (« autre »), bornes comprises.
const LENGTH_CASES: [Pick<CourseSettings, "length" | "wordCount">, number][] = [
  [{ length: "very-short", wordCount: 50 }, 10],
  [{ length: "short", wordCount: 50 }, 25],
  [{ length: "medium", wordCount: 50 }, 50],
  [{ length: "long", wordCount: 50 }, 100],
  [{ length: "other", wordCount: 137 }, 137],
  [{ length: "other", wordCount: 1 }, 1],
  [{ length: "other", wordCount: 1000 }, 1000],
];
const LONG_PASSAGE = Array.from({ length: 1200 }, (_, i) => `mot${i}`).join(" ");
const allQuotes = (language: "fr" | "en") => Object.values(QUOTES[language]).flat();
const countOf = (text: string) => text.trim().split(/\s+/).length;

describe("CONF-04 — random words: exactly the requested number of words", () => {
  for (const [length, expected] of LENGTH_CASES) {
    test(`${length.length} (${expected}) gives ${expected} words, with every option on`, () => {
      const words = buildWords(settings({ textType: "words", ...length, punctuation: true, numbers: true, specials: true, accents: false }), seededRandom(expected));
      expect(words).toHaveLength(expected);
    });
  }

  test("excluded characters never shorten the text, even with numbers and specials that contain them", () => {
    for (let seed = 0; seed < 30; seed++) {
      const words = buildWords(settings({ textType: "words", length: "long", numbers: true, specials: true, excluded: "1@#e" }), seededRandom(seed));
      expect(words).toHaveLength(100);
      expect(words.some((word) => /[1@#e]/i.test(word))).toBe(false);
    }
  });

  test("CONF-07: excluded punctuation is not added at the end of words, and the count stays exact", () => {
    for (let seed = 0; seed < 30; seed++) {
      const words = buildWords(settings({ textType: "words", length: "long", punctuation: true, excluded: ".,!?;:" }), seededRandom(seed));
      expect(words).toHaveLength(100);
      expect(words.filter((word) => /[.,!?;:]/.test(word))).toEqual([]);
    }
  });

  test("CONF-07: punctuation that is not excluded is still added", () => {
    const words = buildWords(settings({ textType: "words", length: "long", punctuation: true, excluded: ".!?" }), seededRandom(9));
    expect(words.some((word) => /[,;:]$/.test(word))).toBe(true);
    expect(words.some((word) => /[.!?]/.test(word))).toBe(false);
  });

  test("excluding every letter keeps the length (the exclusion cannot be honoured, the count is)", () => {
    const words = buildWords(settings({ textType: "words", length: "short", excluded: "aeiouyst" }), seededRandom(3));
    expect(words).toHaveLength(25);
  });
});

describe("CONF-04 — coherent text: exactly the requested number of words", () => {
  for (const [length, expected] of LENGTH_CASES) {
    test(`${length.length} (${expected}) cuts the server passage at ${expected} words`, () => {
      const words = buildWords(settings({ textType: "coherent", ...length, numbers: true, specials: true }), seededRandom(expected), LONG_PASSAGE);
      expect(words).toHaveLength(expected);
    });

    test(`${length.length} (${expected}) without a server passage still gives ${expected} words`, () => {
      expect(buildWords(settings({ textType: "coherent", ...length }), seededRandom(expected), null)).toHaveLength(expected);
    });
  }

  test("CONF-07: excluded characters are ignored in coherent mode, the passage stays whole and in order", () => {
    const words = buildWords(settings({ textType: "coherent", length: "medium", excluded: "ea" }), seededRandom(1), `${PASSAGE} ${LONG_PASSAGE}`);
    expect(words).toHaveLength(50);
    expect(words.slice(0, 21).join(" ")).toBe(PASSAGE);
  });

  test("CONF-07: excluded characters are ignored without a server passage too", () => {
    expect(buildWords(settings({ textType: "coherent", length: "long", excluded: "e" }), seededRandom(2), null)).toHaveLength(100);
  });
});

describe("CONF-04 — quote: one whole quote, the closest to the requested length", () => {
  for (const language of ["fr", "en"] as const) {
    for (const [length, expected] of LENGTH_CASES) {
      test(`${language} ${length.length} (${expected}): a whole quote whose word count is the closest to ${expected}`, () => {
        const best = Math.min(...allQuotes(language).map((quote) => Math.abs(countOf(quote) - expected)));
        for (let seed = 0; seed < 10; seed++) {
          const text = buildWords(settings({ textType: "quote", language, ...length }), seededRandom(seed)).join(" ");
          expect(allQuotes(language)).toContain(text);
          expect(Math.abs(countOf(text) - expected)).toBe(best);
        }
      });
    }
  }

  for (const language of ["fr", "en"] as const) {
    test(`${language} long: a quote of 90 to 110 words, never the medium one`, () => {
      for (let seed = 0; seed < 20; seed++) {
        const long = buildWords(settings({ textType: "quote", language, length: "long" }), seededRandom(seed));
        const medium = buildWords(settings({ textType: "quote", language, length: "medium" }), seededRandom(seed));
        expect(long.length).toBeGreaterThanOrEqual(90);
        expect(long.length).toBeLessThanOrEqual(110);
        expect(long.join(" ")).not.toBe(medium.join(" "));
      }
    });
  }

  test("a longer length never gives a shorter quote", () => {
    const size = (length: CourseSettings["length"]) => buildWords(settings({ textType: "quote", length }), seededRandom(5)).length;
    expect(size("very-short")).toBeLessThanOrEqual(size("short"));
    expect(size("short")).toBeLessThanOrEqual(size("medium"));
    expect(size("medium")).toBeLessThanOrEqual(size("long"));
  });

  test("CONF-07: excluded characters do not cut words out of the quote", () => {
    const text = buildWords(settings({ textType: "quote", length: "long", excluded: "e" }), seededRandom(1)).join(" ");
    expect(allQuotes("fr")).toContain(text);
  });

  test("the same seed gives the same quote to every member", () => {
    const draw = () => buildWords(settings({ textType: "quote", length: "medium" }), seededRandom(77)).join(" ");
    expect(draw()).toBe(draw());
  });
});
