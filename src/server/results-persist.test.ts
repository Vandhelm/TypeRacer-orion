// RES-05 / HIST-02 / COURSE-10 : ce que le serveur garde des résultats d'une course de salon, et son reclassement.
import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq, sql } from "drizzle-orm";
import { players, raceConfigs, raceResults, races, raceSamples, roomMembers, rooms, user } from "../../db/schema";
import { createMockDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { MAX_HUMAN_WPM } from "../realtime/referee";
import { MAX_GUESTS } from "../rooms/settings";
import { createAuth } from "./auth";
import { launchBots } from "./bot-course";
import { handleRace, MAX_RAW_WPM } from "./races";
import { launchedRoomFor, withoutBotCourse } from "./races.fixture";
import { abandonRace, eliminateRunner, keepReceivedBonus, memberKey, recordProgress } from "./rooms";
import { rerankLaunch } from "./ranking";
import { raceDetail } from "./history";
import { botRunnerId } from "../rooms/bots";
import { COUNTDOWN_MS } from "../rooms/race-clock";
import { toResults } from "../views/podium/results";

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

describe("RES-05 — a full room (SALLE-05, MAX_GUESTS participants) is recorded whole", () => {
  test("30 participants with 10-minute series are all recorded: the account's row and 29 others", async () => {
    const me = await signUp("Plein_Moi");
    const { code } = await launchedRoomFor(db, auth, me.cookie, GUEST_SECRET, 10_000);
    const series = { wpmSeries: Array(600).fill(99), rawSeries: Array(600).fill(99), errorSeries: Array(600).fill(9) };
    const rivals = Array.from({ length: MAX_GUESTS - 1 }, (_, i) => result(`Plein_${i}`, series));
    const res = await post({ room: code, summary: SUMMARY, players: [result("Plein_Moi"), ...rivals] }, me.cookie);
    expect(res.status).toBe(201);
    const raceId = await raceIdOf(res);
    const [race] = await db.select({ others: races.others }).from(races).where(eq(races.id, raceId));
    expect(race!.others.length).toBe(MAX_GUESTS - 1);
    expect(await db.$count(raceResults, eq(raceResults.raceId, raceId))).toBe(1);
  });

  test("one participant more than a room holds is refused (400)", async () => {
    const me = await signUp("Trop_Moi");
    const { code } = await launchedRoomFor(db, auth, me.cookie, GUEST_SECRET, 10_000);
    const res = await post({ room: code, summary: SUMMARY, players: Array.from({ length: MAX_GUESTS + 1 }, (_, i) => result(i ? `Trop_${i}` : "Trop_Moi")) }, me.cookie);
    expect(res.status).toBe(400);
  });
});

describe("HIST-02 — the bonuses each runner received are recorded and shown again from the history", () => {
  /** Un compte et un invité dans un salon lancé, bonus activés ou non ; renvoie aussi le départ et les bots assis. */
  const launched = async (prefix: string, catchUpBonus: boolean) => {
    const me = await signUp(`${prefix}_Moi`);
    const rival = { kind: "guest" as const, name: `${prefix}_Autre`, sessionId: crypto.randomUUID() };
    const { code, who } = await launchedRoomFor(db, auth, me.cookie, GUEST_SECRET, 10_000, [rival]);
    const [room] = await db.select({ id: rooms.id, configId: rooms.configId, launchedAt: rooms.launchedAt, botList: rooms.botList }).from(rooms).where(eq(rooms.code, code));
    await db.update(raceConfigs).set({ catchUpBonus }).where(eq(raceConfigs.id, room!.configId));
    const startsAt = room!.launchedAt!.getTime() + COUNTDOWN_MS;
    const [first, second] = room!.botList.map((bot) => bot.name);
    return { me, who, rival, code, roomId: room!.id, startsAt, bots: [first!, second!] as [string, string] };
  };
  const body = (t: Awaited<ReturnType<typeof launched>>) => [
    // le corps se donne 3 bonus : jamais lu
    result(t.who.name, { bonuses: { count: 3, kinds: ["fog", "fog", "fog"] } }),
    result(t.rival.name),
    ...t.bots.map((name) => ({ ...result(name), bot: true })),
  ];

  test("humans get the bonuses the realtime server kept, bots those of rooms.bot_bonuses; the history and the podium read them back", async () => {
    const t = await launched("Bonus_On", true);
    await keepReceivedBonus(db, t.code, t.startsAt, memberKey(t.who), "fog");
    await keepReceivedBonus(db, t.code, t.startsAt, memberKey(t.rival), null);
    await keepReceivedBonus(db, t.code, t.startsAt, memberKey(t.rival), "fewer_words");
    const fog = { kind: "fog" as const, target: "x", durationMs: 1000 };
    // un effet sur le premier bot (sans from) ne compte pas : seul celui qu'il a reçu (from)
    await db.update(rooms).set({ botBonuses: [{ at: 1, seq: 0, effect: { ...fog, target: botRunnerId(t.bots[0]) } }, { at: 2, seq: 1, from: botRunnerId(t.bots[0]), effect: fog }] }).where(eq(rooms.id, t.roomId));
    const res = await post({ room: t.code, summary: SUMMARY, players: body(t) }, t.me.cookie);
    expect(res.status).toBe(201);
    const raceId = await raceIdOf(res);
    const rows = await db.select({ name: players.name, bonuses: raceResults.bonuses }).from(raceResults).innerJoin(players, eq(players.id, raceResults.playerId)).where(eq(raceResults.raceId, raceId));
    const of = (name: string) => rows.find((r) => r.name === name)!.bonuses;
    expect(of(t.who.name)).toEqual({ count: 1, kinds: ["fog"] });
    expect(of(t.bots[0])).toEqual({ count: 1, kinds: ["fog"] });
    expect(of(t.bots[1])).toEqual({ count: 0, kinds: [] });
    const [race] = await db.select({ others: races.others }).from(races).where(eq(races.id, raceId));
    expect(race!.others.find((o) => o.name === t.rival.name)!.bonuses).toEqual({ count: 2, kinds: ["fewer_words"] });
    // /podium?race=N : le détail de l'historique, puis le tableau du podium (toResults)
    const detail = await raceDetail(db, t.me.playerId, raceId);
    const shown = toResults(detail)!.players;
    expect(Object.fromEntries(shown.map((p) => [p.name, p.bonuses as unknown]))).toEqual({
      [t.who.name]: { count: 1, kinds: ["fog"] },
      [t.rival.name]: { count: 2, kinds: ["fewer_words"] },
      [t.bots[0]]: { count: 1, kinds: ["fog"] },
      [t.bots[1]]: { count: 0, kinds: [] },
    });
  });

  test("a bonus received after the race was recorded (a rival still racing) is counted when the room reaches the results", async () => {
    const t = await launched("Bonus_Tard", true);
    await withoutBotCourse(db, t.code);
    await recordProgress(db, t.code, memberKey(t.who), 1);
    const res = await post({ room: t.code, summary: SUMMARY, players: [result(t.who.name, { finished: true }), result(t.rival.name)] }, t.me.cookie);
    expect(res.status).toBe(201);
    const raceId = await raceIdOf(res);
    await keepReceivedBonus(db, t.code, t.startsAt, memberKey(t.rival), "extra_words");
    await recordProgress(db, t.code, memberKey(t.rival), 1); // le dernier arrive : le salon passe aux résultats
    const [race] = await db.select({ others: races.others }).from(races).where(eq(races.id, raceId));
    expect(race!.others[0]!.bonuses).toEqual({ count: 1, kinds: ["extra_words"] });
  });

  test("with bonuses off, nothing is recorded: the column stays empty, whatever the body says", async () => {
    const t = await launched("Bonus_Off", false);
    const res = await post({ room: t.code, summary: SUMMARY, players: body(t) }, t.me.cookie);
    expect(res.status).toBe(201);
    const raceId = await raceIdOf(res);
    const rows = await db.select({ bonuses: raceResults.bonuses }).from(raceResults).where(eq(raceResults.raceId, raceId));
    expect(rows.every((r) => r.bonuses === null)).toBe(true);
    const [race] = await db.select({ others: races.others }).from(races).where(eq(races.id, raceId));
    expect(race!.others[0]).not.toHaveProperty("bonuses");
    expect(toResults(await raceDetail(db, t.me.playerId, raceId))!.players.every((p) => p.bonuses === undefined)).toBe(true);
  });

  test("a bonus kept for another launch, or beyond the 3 a race gives, is not counted", async () => {
    const t = await launched("Bonus_Borne", true);
    await keepReceivedBonus(db, t.code, t.startsAt - 1000, memberKey(t.who), "fog");
    for (let i = 0; i < 5; i++) await keepReceivedBonus(db, t.code, t.startsAt, memberKey(t.rival), "fog");
    const [rival] = await db.select({ received: roomMembers.receivedBonuses }).from(roomMembers).where(and(eq(roomMembers.roomId, t.roomId), eq(roomMembers.memberKey, memberKey(t.rival))));
    expect(rival!.received).toEqual(["fog", "fog", "fog"]);
    const [mine] = await db.select({ received: roomMembers.receivedBonuses }).from(roomMembers).where(and(eq(roomMembers.roomId, t.roomId), eq(roomMembers.memberKey, memberKey(t.who))));
    expect(mine!.received).toEqual([]);
  });
});

describe("HIST-02 — an elimination written after a race was recorded reaches that race when it is re-ranked", () => {
  /** Un salon lancé en mode fatal avec ce rival (un compte), sans course de bots calculée ; renvoie son id et son départ. */
  const fatal = async (prefix: string) => {
    const me = await signUp(`${prefix}_Moi`);
    const rival = await signUp(`${prefix}_Autre`);
    const rivalWho = { kind: "account" as const, playerId: rival.playerId, name: `${prefix}_Autre` };
    const { code, who } = await launchedRoomFor(db, auth, me.cookie, GUEST_SECRET, 10_000, [rivalWho]);
    await withoutBotCourse(db, code);
    const [room] = await db.select({ id: rooms.id, configId: rooms.configId, launchedAt: rooms.launchedAt }).from(rooms).where(eq(rooms.code, code));
    await db.update(raceConfigs).set({ mistakes: "fatal" }).where(eq(raceConfigs.id, room!.configId));
    return { me, who, rival, rivalWho, code, roomId: room!.id, startsAt: room!.launchedAt!.getTime() + COUNTDOWN_MS };
  };
  const fatalSummary = { ...SUMMARY, mistakes: "fatal" };

  test("A posts after arriving, B is eliminated later: in A's race, others[B].eliminated is true", async () => {
    const t = await fatal("Elim_Tard");
    await recordProgress(db, t.code, memberKey(t.who), 1);
    const res = await post({ room: t.code, summary: fatalSummary, players: [result(t.who.name, { finished: true }), result(t.rivalWho.name)] }, t.me.cookie);
    expect(res.status).toBe(201);
    const raceId = await raceIdOf(res);
    const before = (await db.select({ others: races.others }).from(races).where(eq(races.id, raceId)))[0]!.others;
    expect(before.find((o) => o.name === t.rivalWho.name)!.eliminated).toBe(false);
    expect(await eliminateRunner(db, t.code, t.startsAt, memberKey(t.rivalWho), 0.4)).toBe(true);
    await rerankLaunch(db, t.roomId);
    const [race] = await db.select({ others: races.others }).from(races).where(eq(races.id, raceId));
    const other = race!.others.find((o) => o.name === t.rivalWho.name)!;
    expect(other.eliminated).toBe(true);
    expect(other.finished).toBe(false);
  });

  test("the eliminated runner's own race, posted before the elimination was written, is recorded eliminated", async () => {
    const t = await fatal("Elim_Soi");
    await recordProgress(db, t.code, memberKey(t.rivalWho), 0.3);
    const res = await post({ room: t.code, summary: fatalSummary, players: [result(t.rivalWho.name), result(t.who.name)] }, t.rival.cookie);
    expect(res.status).toBe(201);
    const raceId = await raceIdOf(res);
    expect((await rowOf(raceId, t.rivalWho.name)).eliminated).toBe(false);
    expect(await eliminateRunner(db, t.code, t.startsAt, memberKey(t.rivalWho), 0.4)).toBe(true);
    await rerankLaunch(db, t.roomId);
    expect((await rowOf(raceId, t.rivalWho.name)).eliminated).toBe(true);
  });

  test("a bot the engine eliminates after the race was recorded is shown eliminated in that race", async () => {
    const me = await signUp("Elim_Bot_Tard");
    // la course vient de partir : aucun bot n'a encore tapé, aucun n'est éliminé
    const { code } = await launchedRoomFor(db, auth, me.cookie, GUEST_SECRET, COUNTDOWN_MS);
    const [room] = await db.select({ id: rooms.id, configId: rooms.configId }).from(rooms).where(eq(rooms.code, code));
    await db.update(raceConfigs).set({ mistakes: "fatal", botAccuracy: "shaky" }).where(eq(raceConfigs.id, room!.configId));
    const early = (await launchBots(db, room!.id, 1)).standings;
    expect([...early.values()].every((s) => !s.eliminatedAt)).toBe(true);
    const bots = [...early.keys()];
    const res = await post({ room: code, summary: { ...fatalSummary, botAccuracy: "shaky" }, players: [result("Elim_Bot_Tard", { seconds: 0 }), ...bots.map((name) => ({ ...result(name, { seconds: 0 }), bot: true }))] }, me.cookie);
    expect(res.status).toBe(201);
    const raceId = await raceIdOf(res);
    // 70 s plus tard : le moteur en a éliminé (la course enregistrée suit le départ reculé)
    await db.update(rooms).set({ launchedAt: sql`now() - ${70_000} * interval '1 millisecond'` }).where(eq(rooms.id, room!.id));
    const [moved] = await db.select({ launchedAt: rooms.launchedAt }).from(rooms).where(eq(rooms.id, room!.id));
    await db.update(races).set({ startedAt: new Date(moved!.launchedAt!.getTime() + COUNTDOWN_MS) }).where(eq(races.id, raceId));
    const late = (await launchBots(db, room!.id, 1)).standings;
    const out = bots.filter((name) => late.get(name)!.eliminatedAt);
    expect(out.length).toBeGreaterThan(0);
    await rerankLaunch(db, room!.id);
    const recorded = await db.select({ name: players.name, eliminated: raceResults.eliminated }).from(raceResults).innerJoin(players, eq(players.id, raceResults.playerId)).where(and(eq(raceResults.raceId, raceId), eq(players.isBot, true)));
    expect(recorded.filter((r) => r.eliminated).map((r) => r.name.toLowerCase()).sort()).toEqual(out.sort());
  });
});
