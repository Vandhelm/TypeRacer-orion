// COURSE-10 : le classement final enregistré par le serveur (rankByServer, POST /api/races).
import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { raceResults, races, user } from "../../db/schema";
import { createMockDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { createAuth } from "./auth";
import { handleRace, rankByServer, type ServerStanding } from "./races";
import { launchedRoomFor } from "./races.fixture";
import { abandonRace, memberKey, recordProgress } from "./rooms";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
const GUEST_SECRET = "guest-secret-guest-secret-guest-secret";

const at = (s: number) => new Date(1_000_000 + s * 1000);
type Row = { name: string; rank: number; finished?: boolean; progress?: number };
const row = (name: string, extra: Partial<Row> = {}): Row => ({ name, rank: 0, ...extra });
const arrived = (s: number, seat = 0): ServerStanding => ({ finishedAt: at(s), progress: 1, seat });
const racing = (progress: number, seat = 0): ServerStanding => ({ finishedAt: null, progress, seat });
const gaveUp = (progress: number, seat = 0): ServerStanding => ({ finishedAt: null, progress, abandonedAt: at(10), seat });
const names = (rows: Row[]) => rows.map((r) => [r.name, r.rank]);

describe("COURSE-10 — final ranking recorded by the server: finished, then not finished, then abandoned", () => {
  test("finished players are ranked by arrival time, whatever the body order", () => {
    const server = new Map([["lent", arrived(50, 0)], ["rapide", arrived(30, 1)]]);
    expect(names(rankByServer([row("Lent"), row("Rapide")], server))).toEqual([["Rapide", 1], ["Lent", 2]]);
  });

  test("players who did not finish are ranked by validated progress, not by the body", () => {
    const server = new Map([["a", racing(0.2, 0)], ["b", racing(0.7, 1)]]);
    expect(names(rankByServer([row("A", { progress: 1 }), row("B", { progress: 0 })], server))).toEqual([["B", 1], ["A", 2]]);
  });

  test("players who abandoned are ranked by their progress at the abandon", () => {
    const server = new Map([["tot", gaveUp(0.1, 0)], ["tard", gaveUp(0.6, 1)]]);
    expect(names(rankByServer([row("Tot"), row("Tard")], server))).toEqual([["Tard", 1], ["Tot", 2]]);
  });

  test("QA case: an abandon at 26 % ranks behind a player still at 0 % who did not abandon", () => {
    const server = new Map([["parti", gaveUp(0.26, 0)], ["immobile", racing(0, 1)]]);
    expect(names(rankByServer([row("Parti"), row("Immobile")], server))).toEqual([["Immobile", 1], ["Parti", 2]]);
  });

  test("order between categories: finished, not finished, abandoned, then humans unknown to the server", () => {
    const server = new Map([["abandon", gaveUp(0.9, 0)], ["course", racing(0.1, 1)], ["arrive", arrived(40, 2)]]);
    const ranked = rankByServer([row("Inconnu"), row("Abandon"), row("Course"), row("Arrive")], server);
    expect(names(ranked)).toEqual([["Arrive", 1], ["Course", 2], ["Abandon", 3], ["Inconnu", 4]]);
  });

  test("ties: same arrival time or same progress → the seat in the room decides, never the body order", () => {
    const server = new Map([
      ["b", arrived(30, 3)], ["a", arrived(30, 1)],
      ["d", racing(0.5, 5)], ["c", racing(0.5, 4)],
      ["f", gaveUp(0.2, 7)], ["e", gaveUp(0.2, 6)],
    ]);
    const ranked = rankByServer(["B", "A", "D", "C", "F", "E"].map((n) => row(n)), server);
    expect(ranked.map((r) => r.name)).toEqual(["A", "B", "C", "D", "E", "F"]);
  });
});

describe("COURSE-10 — bots are placed by what the browser knows of them, never before a human the server saw finish", () => {
  const bots = new Set(["thon_rouge", "wasabi99"]);

  test("a finished bot ranks after the humans the server saw finish, before every unfinished human", () => {
    const server = new Map([["humain", arrived(50, 0)], ["lent", racing(0.95, 1)]]);
    const ranked = rankByServer([row("Thon_Rouge", { finished: true, progress: 1 }), row("Lent"), row("Humain")], server, bots);
    expect(names(ranked)).toEqual([["Humain", 1], ["Thon_Rouge", 2], ["Lent", 3]]);
  });

  test("an unfinished bot is ranked among unfinished humans by its progress", () => {
    const server = new Map([["devant", racing(0.8, 0)], ["derriere", racing(0.2, 1)]]);
    const ranked = rankByServer([row("Derriere"), row("Thon_Rouge", { finished: false, progress: 0.5 }), row("Devant")], server, bots);
    expect(names(ranked)).toEqual([["Devant", 1], ["Thon_Rouge", 2], ["Derriere", 3]]);
  });

  test("a bot at the same progress as a human ranks after him (humans' seats come before the bots' lanes)", () => {
    const server = new Map([["humain", racing(0.5, 0)]]);
    const ranked = rankByServer([row("Thon_Rouge", { finished: false, progress: 0.5 }), row("Humain")], server, bots);
    expect(ranked.map((r) => r.name)).toEqual(["Humain", "Thon_Rouge"]);
  });

  test("a bot never abandons: an unfinished bot at 10 % ranks before a human who abandoned at 90 %", () => {
    const server = new Map([["parti", gaveUp(0.9, 0)]]);
    const ranked = rankByServer([row("Parti"), row("Wasabi99", { finished: false, progress: 0.1 })], server, bots);
    expect(ranked.map((r) => r.name)).toEqual(["Wasabi99", "Parti"]);
  });

  test("bots at the same progress keep the body (lane) order", () => {
    const ranked = rankByServer([row("Wasabi99", { finished: false, progress: 0.3 }), row("Thon_Rouge", { finished: false, progress: 0.3 })], new Map(), bots);
    expect(ranked.map((r) => r.name)).toEqual(["Wasabi99", "Thon_Rouge"]);
  });
});

describe("COURSE-10 — the recorded race follows the final ranking", () => {
  let db: Awaited<ReturnType<typeof createMockDatabase>>;
  let auth: ReturnType<typeof createAuth>;
  beforeAll(async () => {
    db = await createMockDatabase();
    auth = createAuth(db);
  });
  const SUMMARY = {
    textType: "words", language: "fr", duration: 60, level: "common", punctuation: false, numbers: false, specials: false, accents: true,
    excluded: "", mistakes: "fix", botSpeed: "medium", botAccuracy: "high", length: "short", wordCount: 20, sessionSeconds: 90,
  };
  const result = (name: string, extra: Record<string, unknown> = {}) => ({
    name, bot: false, wpm: 40, raw: 45, accuracy: 95, seconds: 5, chars: [80, 2, 0, 0], consistency: 80, idle: 0, finished: false, eliminated: false,
    wpmSeries: [40], rawSeries: [40], errorSeries: [0], ...extra,
  });
  const signUp = async (name: string) => {
    await auth.api.signUpEmail({ body: { name, email: placeholderEmail(name), password: "sushi-roll-42", username: name, displayUsername: name } });
    const { headers } = await auth.api.signInUsername({ body: { username: name, password: "sushi-roll-42" }, returnHeaders: true });
    const [account] = await db.select({ playerId: user.playerId }).from(user).where(eq(user.displayUsername, name));
    return { cookie: headers.get("set-cookie")!.split(";")[0]!, playerId: account!.playerId! };
  };
  const post = (body: Record<string, unknown>, cookie: string) =>
    handleRace(new Request("http://localhost/api/races", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ id: crypto.randomUUID(), ...body }) }), db, auth, GUEST_SECRET);

  test("QA case: an account who abandoned at 26 % is recorded behind a rival still at 0 %", async () => {
    const me = await signUp("Dix_Parti");
    const rival = { kind: "guest" as const, name: "Dix_Immobile", sessionId: crypto.randomUUID() };
    const { code, who } = await launchedRoomFor(db, auth, me.cookie, GUEST_SECRET, 10_000, [rival]);
    await recordProgress(db, code, memberKey(who), 0.26);
    await abandonRace(db, code, who);
    // le corps se met premier, comme le podium d'avant COURSE-10
    const res = await post({ room: code, summary: SUMMARY, players: [result("Dix_Parti", { progress: 0.26 }), result("Dix_Immobile", { progress: 0 })] }, me.cookie);
    expect(res.status).toBe(201);
    const { raceId } = (await res.json()) as { raceId: number };
    const [mine] = await db.select({ rank: raceResults.rank, abandoned: raceResults.abandoned }).from(raceResults).where(eq(raceResults.playerId, me.playerId));
    expect(mine).toEqual({ rank: 2, abandoned: true });
    const [race] = await db.select({ others: races.others }).from(races).where(eq(races.id, raceId));
    expect(race!.others).toEqual([expect.objectContaining({ name: "Dix_Immobile", rank: 1, abandoned: false })]);
    expect(race!.others[0]).not.toHaveProperty("progress");
  });

  test("a finished bot of the room is recorded after the human the server saw finish, before an unfinished one", async () => {
    const me = await signUp("Dix_Lent");
    const rival = { kind: "guest" as const, name: "Dix_Rapide", sessionId: crypto.randomUUID() };
    const { code, who } = await launchedRoomFor(db, auth, me.cookie, GUEST_SECRET, 10_000, [rival]);
    await recordProgress(db, code, memberKey(rival), 1);
    await recordProgress(db, code, memberKey(who), 0.9);
    const bot = { ...result("Thon_Rouge", { finished: true, progress: 1 }), bot: true };
    const res = await post({ room: code, summary: SUMMARY, players: [result("Dix_Lent", { progress: 1, finished: true }), bot, result("Dix_Rapide", { finished: true })] }, me.cookie);
    expect(res.status).toBe(201);
    const [mine] = await db.select({ rank: raceResults.rank, finished: raceResults.finished }).from(raceResults).where(eq(raceResults.playerId, me.playerId));
    expect(mine).toEqual({ rank: 3, finished: false });
  });

  test("a progress outside 0..1 in the body is refused (400)", async () => {
    const me = await signUp("Dix_Borne");
    const { code } = await launchedRoomFor(db, auth, me.cookie, GUEST_SECRET, 10_000);
    expect((await post({ room: code, summary: SUMMARY, players: [result("Dix_Borne", { progress: 1.5 })] }, me.cookie)).status).toBe(400);
    expect((await post({ room: code, summary: SUMMARY, players: [result("Dix_Borne", { progress: "0.5" })] }, me.cookie)).status).toBe(400);
  });
});
