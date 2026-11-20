import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { raceConfigs, races } from "../../db/schema";
import { createMockDatabase } from "../../db/mocks/test-database";
import { InvalidRace, parseRace, recordRace } from "./races";

const SUMMARY = {
  textType: "words", language: "fr", duration: 60, level: "common", punctuation: true, numbers: false, specials: false, capitals: false, accents: true,
  excluded: "", mistakes: "fix", botSpeed: "medium", botAccuracy: "high", length: "short", wordCount: 20, sessionSeconds: 90,
};
const bot = {
  name: "Nori_Ninja", bot: true, wpm: 40, raw: 45, accuracy: 95, seconds: 3, chars: [40, 2, 0, 0], consistency: 80, idle: 0, finished: true, eliminated: false,
  wpmSeries: [40, 41, 42], rawSeries: [], errorSeries: [],
};
const body = (summary: Record<string, unknown>) => ({ summary, content: "le riz attend", players: [bot] });

describe("CONF-06 — a recorded race keeps its capitals option", () => {
  test("capitals off is read from the summary", () => {
    expect(parseRace(body(SUMMARY)).config.capitals).toBe(false);
    expect(parseRace(body({ ...SUMMARY, capitals: true })).config.capitals).toBe(true);
  });

  test("a summary without the option (older client) keeps the capitals, as before the option existed", () => {
    const { capitals: _capitals, ...older } = SUMMARY;
    expect(parseRace(body(older)).config.capitals).toBe(true);
  });

  test("a value that is not a boolean is refused", () => {
    for (const capitals of ["false", 0, null]) expect(() => parseRace(body({ ...SUMMARY, capitals }))).toThrow(InvalidRace);
  });

  test("a race typed without capitals is stored with race_configs.capitals = false", async () => {
    const db = await createMockDatabase();
    const id = (await recordRace(db, parseRace(body(SUMMARY))))!;
    const [row] = await db.select({ capitals: raceConfigs.capitals }).from(races).innerJoin(raceConfigs, eq(raceConfigs.id, races.configId)).where(eq(races.id, id));
    expect(row!.capitals).toBe(false);
  });
});
