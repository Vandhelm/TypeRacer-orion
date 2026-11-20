import { describe, expect, test } from "bun:test";
import { DEFAULT_SETTINGS } from "../../rooms/settings";
import { seededRandom } from "../../rooms/text";
import { buildWords, type CourseSettings } from "./course";
import { LEXICON } from "./lexicon";

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
