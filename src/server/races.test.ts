import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { players, raceResults, raceSamples } from "../../db/schema";
import { createMockDatabase } from "../../db/mocks/test-database";
import { InvalidRace, parseRace, playerStats, recordRace } from "./races";

const SUMMARY = {
  textType: "words", language: "fr", duration: 60, level: "common", punctuation: false, numbers: false, specials: false, accents: true,
  excluded: "", mistakes: "fix", botSpeed: "medium", botAccuracy: "high", length: "short", wordCount: 20, sessionSeconds: 90,
};
const result = (name: string, bot: boolean, wpm: number) => ({
  name, bot, wpm, raw: wpm + 5, accuracy: 95.5, seconds: 3, chars: [40, 2, 0, 0], consistency: 80, idle: 0, finished: true, eliminated: false,
  wpmSeries: [wpm - 2, wpm, wpm + 1], rawSeries: [wpm, wpm + 5, wpm + 6], errorSeries: [0, 1, 0],
});

describe("races", () => {
  let db: Awaited<ReturnType<typeof createMockDatabase>>;
  beforeAll(async () => {
    db = await createMockDatabase();
  });

  test("records the bots of a race, with their per-second samples", async () => {
    const body = { summary: SUMMARY, content: "le riz attend", players: [result("Nouveau_Bot", true, 70), result("Invite_42", false, 60)] };
    const raceId = await recordRace(db, parseRace(body));
    expect(raceId).toBeNumber();
    const [bot] = await db.select().from(players).where(eq(players.name, "Nouveau_Bot"));
    expect(bot!.isBot).toBe(true);
    const rows = await db.select().from(raceResults).where(eq(raceResults.raceId, raceId!));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ playerId: bot!.id, rank: 1, wpm: 70 });
    expect(await db.$count(raceSamples, eq(raceSamples.raceId, raceId!))).toBe(3);
  });

  test("keeps no history for a guest alone", async () => {
    expect(await recordRace(db, parseRace({ summary: SUMMARY, players: [result("Invite_42", false, 60)] }))).toBeNull();
    expect(await db.$count(players, eq(players.name, "Invite_42"))).toBe(0);
  });

  test("never turns a human player into a bot", async () => {
    expect(await recordRace(db, parseRace({ summary: SUMMARY, players: [result("Maki_77", true, 99)] }))).toBeNull();
  });

  test("rejects malformed results", () => {
    expect(() => parseRace({ summary: SUMMARY, players: [] })).toThrow(InvalidRace);
    expect(() => parseRace({ summary: { ...SUMMARY, language: "de" }, players: [result("Bot_X", true, 50)] })).toThrow(InvalidRace);
    expect(() => parseRace({ summary: SUMMARY, players: [{ ...result("Bot_X", true, 50), accuracy: 140 }] })).toThrow(InvalidRace);
  });

  test("computes a player's stats from every race", async () => {
    const stats = await playerStats(db, "nouveau_bot");
    expect(stats).toMatchObject({ name: "Nouveau_Bot", bot: true, races: 1, wins: 1, bestWpm: 70, averageWpm: 70, averageAccuracy: 95.5 });
    expect(stats!.progress).toHaveLength(1);
  });

  test("reads the demo history of a bot", async () => {
    const stats = await playerStats(db, "Thon_Rouge");
    expect(stats!.races).toBeGreaterThan(0);
    expect(stats!.progress.length).toBe(stats!.races);
    expect(stats!.bestWpm).toBeGreaterThanOrEqual(stats!.averageWpm!);
  });

  test("returns null for an unknown player", async () => {
    expect(await playerStats(db, "Personne")).toBeNull();
  });
});
