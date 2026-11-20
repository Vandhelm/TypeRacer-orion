// RES-05 / HIST-02 / COURSE-10 : ce que le serveur garde des résultats d'une course de salon, et son reclassement.
import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq, sql } from "drizzle-orm";
import { players, raceConfigs, raceResults, races, raceSamples, roomMembers, rooms, user } from "../../db/schema";
import { createMockDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { MAX_HUMAN_WPM } from "../realtime/referee";
import { createAuth } from "./auth";
import { launchBots } from "./bot-course";
import { handleRace, MAX_RAW_WPM } from "./races";
import { launchedRoomFor, withoutBotCourse } from "./races.fixture";
import { abandonRace, memberKey, recordProgress } from "./rooms";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
const GUEST_SECRET = "guest-secret-guest-secret-guest-secret";

const SUMMARY = {
  textType: "words", language: "fr", duration: 60, level: "common", punctuation: false, numbers: false, specials: false, accents: true,
  excluded: "", mistakes: "fix", botSpeed: "medium", botAccuracy: "high", length: "short", wordCount: 20, sessionSeconds: 90,
};
const result = (name: string, extra: Record<string, unknown> = {}) => ({
  name, bot: false, wpm: 40, raw: 45, accuracy: 95, seconds: 5, chars: [80, 2, 0, 0], consistency: 80, idle: 0, finished: false, eliminated: false,
  wpmSeries: [40], rawSeries: [40], errorSeries: [0], ...extra,
});

let db: Awaited<ReturnType<typeof createMockDatabase>>;
let auth: ReturnType<typeof createAuth>;
beforeAll(async () => {
  db = await createMockDatabase();
  auth = createAuth(db);
});
const signUp = async (name: string) => {
  await auth.api.signUpEmail({ body: { name, email: placeholderEmail(name), password: "sushi-roll-42", username: name, displayUsername: name } });
  const { headers } = await auth.api.signInUsername({ body: { username: name, password: "sushi-roll-42" }, returnHeaders: true });
  const [account] = await db.select({ playerId: user.playerId }).from(user).where(eq(user.displayUsername, name));
  return { cookie: headers.get("set-cookie")!.split(";")[0]!, playerId: account!.playerId! };
};
const post = (body: Record<string, unknown>, cookie: string) =>
  handleRace(new Request("http://localhost/api/races", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ id: crypto.randomUUID(), ...body }) }), db, auth, GUEST_SECRET);
const raceIdOf = async (res: Response) => ((await res.json()) as { raceId: number }).raceId;
const rowOf = async (raceId: number, name: string) =>
  (await db.select({ rank: raceResults.rank, eliminated: raceResults.eliminated }).from(raceResults).innerJoin(players, eq(players.id, raceResults.playerId)).where(and(eq(raceResults.raceId, raceId), eq(players.name, name))))[0]!;

describe("COURSE-10 — re-ranking a recorded race never breaks the unique rank per race", () => {
  test("two kept rows that swap ranks (account and bot) are re-ranked without a constraint violation", async () => {
    const me = await signUp("Swap_Moi");
    const { code, who } = await launchedRoomFor(db, auth, me.cookie, GUEST_SECRET, 10_000);
    await withoutBotCourse(db, code);
    await recordProgress(db, code, memberKey(who), 0.5);
    // envoyée en pleine course : le compte (0.5) devant le bot (0.3)
    const bot = { ...result("Thon_Rouge", { progress: 0.3 }), bot: true };
    const res = await post({ room: code, summary: SUMMARY, players: [result("Swap_Moi"), bot] }, me.cookie);
    expect(res.status).toBe(201);
    const raceId = await raceIdOf(res);
    expect([(await rowOf(raceId, "Swap_Moi")).rank, (await rowOf(raceId, "Thon_Rouge")).rank]).toEqual([1, 2]);
    // le compte abandonne, dernier humain en course : le salon passe aux résultats, le bot passe devant le compte
    await abandonRace(db, code, who);
    expect([(await rowOf(raceId, "Thon_Rouge")).rank, (await rowOf(raceId, "Swap_Moi")).rank]).toEqual([1, 2]);
  });
});

describe("RES-05 — the eliminated status is the server's, never the body's", () => {
  test("a race outside fatal mode posted with eliminated: true is recorded as not eliminated", async () => {
    const me = await signUp("Elim_Faux");
    const { code, who } = await launchedRoomFor(db, auth, me.cookie, GUEST_SECRET, 10_000);
    await recordProgress(db, code, memberKey(who), 0.4);
    const res = await post({ room: code, summary: SUMMARY, players: [result("Elim_Faux", { eliminated: true })] }, me.cookie);
    expect(res.status).toBe(201);
    expect((await rowOf(await raceIdOf(res), "Elim_Faux")).eliminated).toBe(false);
  });

  test("a runner the server eliminated (room_members.eliminated_at) posting eliminated: false is recorded as eliminated", async () => {
    const me = await signUp("Elim_Vrai");
    const rival = { kind: "guest" as const, name: "Elim_Vrai_Autre", sessionId: crypto.randomUUID() };
    const { code, who } = await launchedRoomFor(db, auth, me.cookie, GUEST_SECRET, 10_000, [rival]);
    const [room] = await db.select({ id: rooms.id, configId: rooms.configId }).from(rooms).where(eq(rooms.code, code));
    await db.update(raceConfigs).set({ mistakes: "fatal" }).where(eq(raceConfigs.id, room!.configId));
    await recordProgress(db, code, memberKey(who), 0.4);
    for (const key of [memberKey(who), memberKey(rival)]) await db.update(roomMembers).set({ eliminatedAt: sql`now()` }).where(and(eq(roomMembers.roomId, room!.id), eq(roomMembers.memberKey, key)));
    const res = await post({ room: code, summary: { ...SUMMARY, mistakes: "fatal" }, players: [result("Elim_Vrai"), result("Elim_Vrai_Autre")] }, me.cookie);
    expect(res.status).toBe(201);
    const raceId = await raceIdOf(res);
    expect((await rowOf(raceId, "Elim_Vrai")).eliminated).toBe(true);
    const [race] = await db.select({ others: races.others }).from(races).where(eq(races.id, raceId));
    expect(race!.others.find((o) => o.name === "Elim_Vrai_Autre")!.eliminated).toBe(true);
  });
});

describe("RES-05 — a bot whose course the server computes is eliminated as the server computed it", () => {
  test("fatal mode: the bots the engine eliminates are recorded eliminated, whatever the body says", async () => {
    const me = await signUp("Elim_Bots");
    const { code } = await launchedRoomFor(db, auth, me.cookie, GUEST_SECRET, 70_000);
    const [room] = await db.select({ id: rooms.id, configId: rooms.configId }).from(rooms).where(eq(rooms.code, code));
    await db.update(raceConfigs).set({ mistakes: "fatal", botAccuracy: "shaky" }).where(eq(raceConfigs.id, room!.configId));
    const { standings } = await launchBots(db, room!.id, 1, true);
    const bots = [...standings.keys()];
    expect(bots.length).toBeGreaterThan(0);
    const body = bots.map((name, index) => ({ ...result(name, { eliminated: index % 2 === 0 }), bot: true }));
    const res = await post({ room: code, summary: { ...SUMMARY, mistakes: "fatal", botAccuracy: "shaky" }, players: [result("Elim_Bots"), ...body] }, me.cookie);
    expect(res.status).toBe(201);
    const raceId = await raceIdOf(res);
    const recorded = await db.select({ name: players.name, eliminated: raceResults.eliminated }).from(raceResults).innerJoin(players, eq(players.id, raceResults.playerId)).where(and(eq(raceResults.raceId, raceId), eq(players.isBot, true)));
    expect(recorded.length).toBe(bots.length);
    const out = recorded.filter((r) => r.eliminated).map((r) => r.name.toLowerCase());
    expect(out.length).toBeGreaterThan(0);
    expect(out.sort()).toEqual(bots.filter((name) => standings.get(name)!.eliminatedAt).sort());
  });
});

describe("RES-05 — the WPM series are bounded like the measures they chart", () => {
  test("a WPM point at 5000 is kept at MAX_HUMAN_WPM, a raw point at 5000 at the raw bound", async () => {
    const me = await signUp("Serie_Borne");
    const { code } = await launchedRoomFor(db, auth, me.cookie, GUEST_SECRET, 10_000);
    const res = await post({ room: code, summary: SUMMARY, players: [result("Serie_Borne", { wpmSeries: [40, 5000], rawSeries: [45, 5000], errorSeries: [0, 0] })] }, me.cookie);
    expect(res.status).toBe(201);
    const samples = await db.select({ wpm: raceSamples.wpm, raw: raceSamples.raw }).from(raceSamples).where(and(eq(raceSamples.raceId, await raceIdOf(res)), eq(raceSamples.playerId, me.playerId))).orderBy(raceSamples.second);
    expect(samples).toEqual([{ wpm: 40, raw: 45 }, { wpm: MAX_HUMAN_WPM, raw: MAX_RAW_WPM }]);
  });
});
