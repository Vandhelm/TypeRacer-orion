// BOT-05 / COURSE-09 / COURSE-10 : le serveur calcule la course des bots avec le moteur partagé (graine du salon) : la
// fin « tous arrivés » les attend, et le classement final prend leur arrivée calculée, pas celle du navigateur.
import { beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { players, raceResults, roomMembers, rooms } from "../../db/schema";
import { botProfile, botSeed, simulateBot } from "../rooms/bot-engine";
import { courseWords } from "../rooms/course-words";
import { COUNTDOWN_MS } from "../rooms/race-clock";
import type { RoomSettings } from "../rooms/settings";
import { finishAsServer } from "./finish.fixture";
import { handleRace } from "./races";
import { rankByServer } from "./ranking";
import { roomsFixture, SECRET } from "./rooms.fixture";
import { refreshRoom, roomRaceState, type RoomView } from "./rooms";

type Fixture = Awaited<ReturnType<typeof roomsFixture>>;
const BOT = "Saba_Sensei";
const SUMMARY = {
  textType: "words", language: "fr", duration: null, level: "common", punctuation: false, numbers: false, specials: false, accents: true,
  excluded: "", mistakes: "fix", botSpeed: "medium", botAccuracy: "high", length: "short", wordCount: 20, sessionSeconds: 90,
};
const result = (name: string, bot: boolean, finished: boolean) => ({
  name, bot, wpm: 40, raw: 45, accuracy: 95, seconds: 20, chars: [100, 2, 0, 0], consistency: 80, idle: 0, finished, eliminated: false,
  wpmSeries: [40], rawSeries: [45], errorSeries: [0], ...(bot ? { progress: finished ? 1 : 0.1 } : {}),
});

describe("BOT-05 — the server waits for the bots it computes from the room seed", () => {
  let t: Fixture;
  beforeAll(async () => {
    t = await roomsFixture();
  });
  const launchedAgo = (code: string, ms: number) => t.db.update(rooms).set({ launchedAt: sql`now() - ${ms} * interval '1 millisecond'` }).where(eq(rooms.code, code));
  const post = (body: Record<string, unknown>, cookie: string) =>
    handleRace(new Request("http://localhost/api/races", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ id: crypto.randomUUID(), ...body }) }), t.db, t.auth, SECRET);

  /** L'hôte seul avec un bot lent, lancé ; `arrivalMs` : l'arrivée du bot selon le moteur, depuis le départ. */
  const hostWithSlowBot = async (name: string, settings: Partial<RoomSettings> = {}) => {
    const { room, host } = await t.open(name, { bots: true, guests: 2, duration: null, textType: "words", length: "long", botList: [{ name: BOT, level: "slow" }], ...settings });
    expect((await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie)).status).toBe(200);
    const launched = (await t.read(host.cookie, room.code)).body.room as unknown as RoomView;
    const words = courseWords(launched)!;
    const seed = botSeed(launched.seed!, BOT);
    const { wpm } = botProfile(seed, "slow", launched.settings.botAccuracy);
    const durationMs = launched.settings.duration === null ? null : launched.settings.duration * 1000;
    const run = simulateBot({ words, durationMs }, { seed, wpm }, Infinity);
    return { code: room.code, host, arrivalMs: run.arrivedMs };
  };

  test("no time limit: the room keeps racing after the host arrives, and moves to results when the last bot arrives", async () => {
    const { code, host, arrivalMs } = await hostWithSlowBot("Bot05_Attente");
    expect(arrivalMs).not.toBeNull();
    await launchedAgo(code, COUNTDOWN_MS + 5_000);
    expect((await finishAsServer(t.db, t.call, code, host.cookie)).status).toBe(200);
    expect(await roomRaceState(t.db, code)).toBe("racing");
    // juste avant l'arrivée du bot, le balayage ne termine pas la course
    await launchedAgo(code, COUNTDOWN_MS + arrivalMs! - 1_000);
    await refreshRoom(t.db, code);
    expect(await roomRaceState(t.db, code)).toBe("racing");
    // le bot est arrivé : le balayage passe aux résultats
    await launchedAgo(code, COUNTDOWN_MS + arrivalMs! + 500);
    expect(await refreshRoom(t.db, code)).toBe(true);
    expect(await roomRaceState(t.db, code)).toBe("results");
  });

  test("with a time limit, an unfinished bot holds the room only until the end of the race", async () => {
    const { code, host, arrivalMs } = await hostWithSlowBot("Bot05_Limite", { duration: 30 });
    expect(arrivalMs).toBeNull(); // un bot lent ne finit pas un long texte en 30 s
    await launchedAgo(code, COUNTDOWN_MS + 2_000);
    await finishAsServer(t.db, t.call, code, host.cookie);
    expect(await roomRaceState(t.db, code)).toBe("racing");
    await launchedAgo(code, COUNTDOWN_MS + 30_000 + 200);
    await refreshRoom(t.db, code);
    expect(await roomRaceState(t.db, code)).toBe("results");
  });

  test("the host arrives before the bot: the host is first, even if the browser says the bot finished first", async () => {
    const { code, host, arrivalMs } = await hostWithSlowBot("Bot05_Devant");
    await launchedAgo(code, COUNTDOWN_MS + 5_000);
    await finishAsServer(t.db, t.call, code, host.cookie);
    await launchedAgo(code, COUNTDOWN_MS + arrivalMs! + 500);
    // le lancement reculé dans le temps, l'arrivée de l'hôte recule avec lui : 5 s après le départ
    const [launch] = await t.db.select({ id: rooms.id, at: rooms.launchedAt }).from(rooms).where(eq(rooms.code, code));
    await t.db.update(roomMembers).set({ finishedAt: new Date(launch!.at!.getTime() + COUNTDOWN_MS + 5_000) }).where(eq(roomMembers.roomId, launch!.id));
    await refreshRoom(t.db, code);
    expect(await roomRaceState(t.db, code)).toBe("results");
    const res = await post({ room: code, summary: SUMMARY, players: [result(BOT, true, true), result("Bot05_Devant", false, true)] }, host.cookie);
    expect(res.status).toBe(201);
    const ranks = await t.db.select({ name: players.name, rank: raceResults.rank, finished: raceResults.finished }).from(raceResults).innerJoin(players, eq(players.id, raceResults.playerId)).where(eq(raceResults.raceId, ((await res.json()) as { raceId: number }).raceId));
    expect(ranks.sort((a, b) => a.rank - b.rank)).toEqual([{ name: "Bot05_Devant", rank: 1, finished: true }, { name: BOT, rank: 2, finished: true }]);
  });

  test("the bot arrives before the host: the bot is first, even if the browser says it had not finished", async () => {
    const { code, host, arrivalMs } = await hostWithSlowBot("Bot05_Derriere");
    await launchedAgo(code, COUNTDOWN_MS + arrivalMs! + 10_000);
    await finishAsServer(t.db, t.call, code, host.cookie);
    expect(await roomRaceState(t.db, code)).toBe("results");
    const res = await post({ room: code, summary: SUMMARY, players: [result("Bot05_Derriere", false, true), result(BOT, true, false)] }, host.cookie);
    expect(res.status).toBe(201);
    const ranks = await t.db.select({ name: players.name, rank: raceResults.rank, finished: raceResults.finished }).from(raceResults).innerJoin(players, eq(players.id, raceResults.playerId)).where(eq(raceResults.raceId, ((await res.json()) as { raceId: number }).raceId));
    expect(ranks.sort((a, b) => a.rank - b.rank)).toEqual([{ name: BOT, rank: 1, finished: true }, { name: "Bot05_Derriere", rank: 2, finished: true }]);
  });
});

describe("BOT-05 — a bot computed by the server is ranked by its computed race, among the humans", () => {
  const at = (s: number) => new Date(1_000_000 + s * 1000);
  const bots = new Set(["saba_sensei"]);
  const row = (name: string, extra: { finished?: boolean; progress?: number } = {}) => ({ name, rank: 0, ...extra });
  const order = (rows: { name: string }[]) => rows.map((r) => r.name);

  test("arrivals are ordered by time, bot or human; at the same time, the human first", () => {
    const early = new Map([["humain", { finishedAt: at(50), progress: 1, seat: 0 }], ["saba_sensei", { finishedAt: at(40), progress: 1, seat: null }]]);
    expect(order(rankByServer([row("Humain"), row(BOT, { finished: false, progress: 0 })], early, bots))).toEqual([BOT, "Humain"]);
    const tie = new Map([["humain", { finishedAt: at(40), progress: 1, seat: 0 }], ["saba_sensei", { finishedAt: at(40), progress: 1, seat: null }]]);
    expect(order(rankByServer([row(BOT, { finished: true, progress: 1 }), row("Humain")], tie, bots))).toEqual(["Humain", BOT]);
  });

  test("an unfinished bot is placed by its computed progress, not the one in the body", () => {
    const server = new Map([["humain", { finishedAt: null, progress: 0.5, seat: 0 }], ["saba_sensei", { finishedAt: null, progress: 0.7, seat: null }]]);
    expect(order(rankByServer([row("Humain"), row(BOT, { finished: false, progress: 0.1 })], server, bots))).toEqual([BOT, "Humain"]);
  });
});
