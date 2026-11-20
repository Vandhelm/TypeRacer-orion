// BOT-01 : avec les réglages par défaut (texte cohérent, longueur moyenne), sur les vrais passages du corpus en français
// et en anglais, le MPM net moyen de chaque niveau reste dans sa plage : le moteur compense la difficulté du texte.
import { beforeAll, describe, expect, test } from "bun:test";
import { and, asc, eq } from "drizzle-orm";
import { createMockDatabase } from "../../db/mocks/test-database";
import { corpusTexts } from "../../db/schema";
import { BOT_LEVEL_SPECS, BOT_LEVELS, botProfile, botSeed, simulateBot } from "../rooms/bot-engine";
import { courseWords } from "../rooms/course-words";
import { DEFAULT_SETTINGS, LANGUAGES } from "../rooms/settings";
import { wordTarget } from "../rooms/text";
import { composePassage } from "./corpus";

const SEEDS = Array.from({ length: 40 }, (_, i) => 7000 + i);
const textChars = (words: readonly string[]) => words.reduce((sum, word) => sum + word.length + 1, 0);

describe("BOT-01 — on corpus passages, each level's mean net WPM stays in its range", () => {
  /** Par langue : 40 courses, chacune sur un passage composé à partir d'un départ différent, comme au lancement. */
  const courses = new Map<string, string[][]>();
  beforeAll(async () => {
    const db = await createMockDatabase();
    for (const language of LANGUAGES) {
      const starts = await db.select({ id: corpusTexts.id }).from(corpusTexts).where(and(eq(corpusTexts.language, language), eq(corpusTexts.type, "coherent"))).orderBy(asc(corpusTexts.id));
      const settings = { ...DEFAULT_SETTINGS, language };
      const list: string[][] = [];
      for (const [i, seed] of SEEDS.entries()) {
        const passage = await composePassage(db, { language, words: wordTarget(settings), startId: starts[i % starts.length]!.id });
        list.push(courseWords({ settings, seed, passage })!);
      }
      courses.set(language, list);
    }
  });

  for (const language of LANGUAGES) {
    for (const level of BOT_LEVELS) {
      test(`${language}, ${level}: 40 seeds, decent accuracy, fix mode`, () => {
        const wpms = courses.get(language)!.map((words, i) => {
          const seed = botSeed(SEEDS[i]!, "Wasabi99");
          const run = simulateBot({ words, durationMs: null, mistakes: "fix" }, { seed, ...botProfile(seed, level, "decent") }, 3_600_000);
          return textChars(words) / 5 / (run.arrivedMs! / 60_000);
        });
        const mean = wpms.reduce((sum, wpm) => sum + wpm, 0) / wpms.length;
        const [low, high] = BOT_LEVEL_SPECS[level].wpm;
        expect(mean).toBeGreaterThanOrEqual(low);
        expect(mean).toBeLessThanOrEqual(high);
      });
    }
  }
});
