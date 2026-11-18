import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { players, raceResults, raceSamples, user } from "../../db/schema";
import { createMockDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { createAuth } from "./auth";
import { GUEST_COOKIE, signGuest } from "./guest";
import { handleRace, InvalidRace, parseRace, playerStats, recordRace } from "./races";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
const GUEST_SECRET = "guest-secret-guest-secret-guest-secret";

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

  test("adds up a player's keys over every race", async () => {
    const keyed = (keys: unknown) => ({ ...result("Clavier_Bot", true, 50), keys });
    await recordRace(db, parseRace({ summary: SUMMARY, players: [keyed({ e: [10, 2], " ": [4, 0] })] }));
    await recordRace(db, parseRace({ summary: SUMMARY, players: [keyed({ e: [5, 1], ab: [9, 9], z: [-1, 0] })] }));
    expect((await playerStats(db, "Clavier_Bot"))!.keys).toEqual({ e: [15, 3], " ": [4, 0] });
  });

  test("returns null for an unknown player", async () => {
    expect(await playerStats(db, "Personne")).toBeNull();
  });
});

describe("AUTH-06 — a signed-in account keeps its races", () => {
  let db: Awaited<ReturnType<typeof createMockDatabase>>;
  let auth: ReturnType<typeof createAuth>;
  beforeAll(async () => {
    db = await createMockDatabase();
    auth = createAuth(db);
  });

  /** Crée un compte et renvoie le cookie de sa session. */
  const signUp = async (name: string) => {
    await auth.api.signUpEmail({ body: { name, email: placeholderEmail(name), password: "sushi-roll-42", username: name, displayUsername: name } });
    const { headers } = await auth.api.signInUsername({ body: { username: name, password: "sushi-roll-42" }, returnHeaders: true });
    return headers.get("set-cookie")!.split(";")[0]!;
  };
  const accountPlayer = async (name: string) => (await db.select({ playerId: user.playerId }).from(user).where(eq(user.username, name.toLowerCase())))[0]!.playerId!;
  const post = (body: unknown, cookie?: string) =>
    handleRace(new Request("http://localhost/api/races", { method: "POST", headers: { "content-type": "application/json", ...(cookie && { cookie }) }, body: JSON.stringify(body) }), db, auth, GUEST_SECRET);
  const resultsOf = async (playerId: number) => db.$count(raceResults, eq(raceResults.playerId, playerId));

  test("records the race of the player linked to the account", async () => {
    await signUp("Compte_Un");
    const playerId = await accountPlayer("Compte_Un");
    const raceId = await recordRace(db, parseRace({ summary: SUMMARY, players: [result("Compte_Un", false, 64)] }), { playerId });
    expect(raceId).toBeNumber();
    expect(await resultsOf(playerId)).toBe(1);
    expect((await playerStats(db, "Compte_Un"))!.races).toBe(1);
  });

  test("the route finds the account from its session, not from the body", async () => {
    const cookie = await signUp("Compte_Deux");
    const res = await post({ summary: SUMMARY, players: [result("Thon_Rouge", true, 80), result("Compte_Deux", false, 70)] }, cookie);
    expect(res.status).toBe(201);
    const stats = await playerStats(db, "Compte_Deux");
    expect(stats).toMatchObject({ bot: false, races: 1, wins: 0, bestWpm: 70 });
  });

  test("a race posted without a session is refused and changes nothing", async () => {
    await signUp("Compte_Trois");
    const res = await post({ summary: SUMMARY, players: [result("Compte_Trois", false, 90), result("Bot_Sans_Session", true, 50)] });
    expect(res.status).toBe(401);
    expect(await resultsOf(await accountPlayer("Compte_Trois"))).toBe(0);
    expect(await db.$count(players, eq(players.name, "Bot_Sans_Session"))).toBe(0);
  });

  test("an account cannot write a race for another account", async () => {
    const cookie = await signUp("Compte_Quatre");
    await signUp("Compte_Cinq");
    const res = await post({ summary: SUMMARY, players: [result("Compte_Cinq", false, 120)] }, cookie);
    expect(res.status).toBe(200);
    expect(await resultsOf(await accountPlayer("Compte_Cinq"))).toBe(0);
    expect(await resultsOf(await accountPlayer("Compte_Quatre"))).toBe(0);
  });

  test("another player's name in the body is never booked to the session's account", async () => {
    const cookie = await signUp("Compte_Six");
    await post({ summary: SUMMARY, players: [result("Invite_Rapide", false, 150), result("Compte_Six", false, 40)] }, cookie);
    const stats = await playerStats(db, "Compte_Six");
    expect(stats).toMatchObject({ races: 1, bestWpm: 40 });
    expect(await db.$count(players, eq(players.name, "Invite_Rapide"))).toBe(0);
  });

  test("an account posing as a bot is still recorded as itself", async () => {
    const cookie = await signUp("Compte_Sept");
    await post({ summary: SUMMARY, players: [result("Compte_Sept", true, 55)] }, cookie);
    const [row] = await db.select().from(players).where(eq(players.name, "Compte_Sept"));
    expect(row!.isBot).toBe(false);
    expect(await resultsOf(row!.id)).toBe(1);
  });

  test("a guest still keeps no history, even posing as a bot", async () => {
    const cookie = `${GUEST_COOKIE}=${signGuest("Invite_Perle", GUEST_SECRET)}`;
    const res = await post({ summary: SUMMARY, players: [result("Invite_Perle", true, 60), result("Bot_Du_Guest", true, 50)] }, cookie);
    expect(res.status).toBe(201);
    expect(await db.$count(players, eq(players.name, "Invite_Perle"))).toBe(0);
    expect(await db.$count(players, eq(players.name, "Bot_Du_Guest"))).toBe(1);
  });

  test("a forged guest cookie counts as no session", async () => {
    const forged = `${GUEST_COOKIE}=${signGuest("Corail_419", "another-secret-another-secret-12")}`;
    expect((await post({ summary: SUMMARY, players: [result("Bot_Forge", true, 50)] }, forged)).status).toBe(401);
  });
});
