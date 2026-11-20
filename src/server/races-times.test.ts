// COURSE-06 : le temps et le MPM enregistrés pour chaque coureur (race_results) sont ceux que le serveur connaît :
// l'arrivée vue par le temps réel, les caractères de son texte, la course calculée des bots. Le corps n'est cru qu'à la
// tolérance près (SERVER_WPM_SLACK_CHARS, CLOCK_TOLERANCE_MS).
import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq, sql } from "drizzle-orm";
import { players, raceResults, races as racesTable, roomMembers, rooms } from "../../db/schema";
import { raceCourseOf } from "../realtime/room-backend";
import { COUNTDOWN_MS } from "../rooms/race-clock";
import { launchBots } from "./bot-course";
import { handleRace } from "./races";
import { roomView } from "./rooms";
import { roomsFixture, SECRET } from "./rooms.fixture";

type Fixture = Awaited<ReturnType<typeof roomsFixture>>;

const SUMMARY = {
  textType: "words", language: "fr", duration: 120, level: "common", punctuation: false, numbers: false, specials: false, accents: true,
  excluded: "", mistakes: "fix", botSpeed: "medium", botAccuracy: "high", length: "short", wordCount: 20, sessionSeconds: 90,
};
const result = (name: string, wpm: number, seconds: number, bot = false) => ({
  name, bot, wpm, raw: wpm + 5, accuracy: 95, seconds, chars: [150, 2, 0, 0], consistency: 80, idle: 0, finished: true, eliminated: false,
  wpmSeries: [wpm], rawSeries: [wpm], errorSeries: [0],
});
const BOT = "Saba_Sensei";

describe("COURSE-06 — times and speeds are recorded as the server knows them", () => {
  let t: Fixture;
  beforeAll(async () => {
    t = await roomsFixture();
  });
  const post = (body: Record<string, unknown>, cookie: string) =>
    handleRace(new Request("http://localhost/api/races", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ id: crypto.randomUUID(), ...body }) }), t.db, t.auth, SECRET);

  /** Un salon de 2 minutes avec un bot, parti il y a `agoMs` ; l'hôte arrivé `arrivalMs` après le départ (vu par le serveur). */
  const raced = async (name: string, agoMs: number, arrivalMs: number | null) => {
    const { room, host } = await t.open(name, { bots: false, guests: 8, duration: 120 });
    expect((await t.call("PATCH", `/api/rooms/${room.code}`, host.cookie, { settings: { botList: [{ name: BOT, level: "beginner" }] } })).status).toBe(200);
    expect((await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie)).status).toBe(200);
    await t.db.update(rooms).set({ launchedAt: sql`now() - ${agoMs + COUNTDOWN_MS} * interval '1 millisecond'` }).where(eq(rooms.code, room.code));
    const [row] = await t.db.select({ id: rooms.id, launchedAt: rooms.launchedAt }).from(rooms).where(eq(rooms.code, room.code));
    if (arrivalMs !== null) {
      const finishedAt = new Date(row!.launchedAt!.getTime() + COUNTDOWN_MS + arrivalMs);
      await t.db.update(roomMembers).set({ progress: 1, finishedAt }).where(and(eq(roomMembers.roomId, row!.id), eq(roomMembers.memberKey, host.key)));
    }
    // le texte du serveur, tel que l'arbitre temps réel le compte (caractères validés à l'arrivée, espaces comprises)
    const course = raceCourseOf(await roomView(t.db, row!.id))!;
    return { code: room.code, roomId: row!.id, host, textChars: course.marks!.at(-1)! };
  };
  const stored = async (raceId: number, name: string) => {
    const [row] = await t.db
      .select({ wpm: raceResults.wpm, raw: raceResults.raw, accuracy: raceResults.accuracy, seconds: raceResults.seconds })
      .from(raceResults)
      .innerJoin(players, eq(players.id, raceResults.playerId))
      .where(and(eq(raceResults.raceId, raceId), eq(players.name, name)));
    return row!;
  };

  test("a finish seen by the server at 60 s, sent as 20 s at 290 MPM, is recorded at 60 s and the server's speed", async () => {
    const { code, host, textChars } = await raced("Times_Triche", 65_000, 60_000);
    const res = await post({ room: code, summary: SUMMARY, players: [result("Times_Triche", 290, 20)] }, host.cookie);
    expect(res.status).toBe(201);
    const mine = await stored(((await res.json()) as { raceId: number }).raceId, "Times_Triche");
    expect(mine.seconds).toBeCloseTo(60, 1);
    expect(mine.wpm).toBe(Math.round(textChars / 5 / 1));
    // MPM brut jamais sous le net
    expect(mine.raw).toBeGreaterThanOrEqual(mine.wpm);
  });

  test("an honest race keeps its speed, within the tolerance", async () => {
    const { code, host, textChars } = await raced("Times_Honnete", 65_000, 60_000);
    // la page a fini un peu avant que le serveur ne reçoive l'arrivée (réseau)
    const honest = Math.round(textChars / 5 / (59.6 / 60));
    const res = await post({ room: code, summary: SUMMARY, players: [result("Times_Honnete", honest, 59.6)] }, host.cookie);
    expect(res.status).toBe(201);
    const mine = await stored(((await res.json()) as { raceId: number }).raceId, "Times_Honnete");
    expect(mine.wpm).toBe(honest);
    expect(mine.seconds).toBeCloseTo(60, 1);
    expect(mine.accuracy).toBe(95);
    expect(mine.raw).toBe(honest + 5);
  });

  test("a runner the server never saw arrive is recorded at the elapsed server time", async () => {
    const { code, host } = await raced("Times_Pas_Arrive", 30_000, null);
    const res = await post({ room: code, summary: SUMMARY, players: [{ ...result("Times_Pas_Arrive", 0, 12), finished: false }] }, host.cookie);
    expect(res.status).toBe(201);
    const mine = await stored(((await res.json()) as { raceId: number }).raceId, "Times_Pas_Arrive");
    expect(mine.seconds).toBeGreaterThanOrEqual(29.5);
    expect(mine.seconds).toBeLessThan(40);
  });

  test("a runner sending a speed without any progress seen by the server gets the server's speed (0)", async () => {
    const { code, host } = await raced("Times_Sans_Progres", 30_000, null);
    const res = await post({ room: code, summary: SUMMARY, players: [{ ...result("Times_Sans_Progres", 120, 30), finished: false }] }, host.cookie);
    expect(res.status).toBe(201);
    const mine = await stored(((await res.json()) as { raceId: number }).raceId, "Times_Sans_Progres");
    expect(mine.wpm).toBe(0);
  });

  test("a bot sent at 299 MPM is recorded at the speed and time of its computed course", async () => {
    const { code, roomId, host } = await raced("Times_Bot", 65_000, 60_000);
    const res = await post({ room: code, summary: SUMMARY, players: [result("Times_Bot", 40, 60), result(BOT, 299, 10, true)] }, host.cookie);
    expect(res.status).toBe(201);
    const bot = await stored(((await res.json()) as { raceId: number }).raceId, BOT);
    const { standings } = await launchBots(t.db, roomId, 1);
    const course = standings.get(BOT.toLowerCase())!;
    expect(course.wpm).toBeLessThan(60); // un bot débutant
    expect(bot.wpm).toBe(course.wpm);
    expect(bot.seconds).toBeCloseTo(course.seconds, 0);
    expect(bot.raw).toBeGreaterThanOrEqual(bot.wpm);
  });

  test("a runner claiming an elimination outside the fatal mode is recorded at the elapsed server time", async () => {
    const { code, host } = await raced("Times_Faux_Elimine", 30_000, null);
    const res = await post({ room: code, summary: SUMMARY, players: [{ ...result("Times_Faux_Elimine", 290, 2), finished: false, eliminated: true }] }, host.cookie);
    expect(res.status).toBe(201);
    const mine = await stored(((await res.json()) as { raceId: number }).raceId, "Times_Faux_Elimine");
    expect(mine.seconds).toBeGreaterThanOrEqual(29.5);
    expect(mine.wpm).toBe(0);
  });

  test("an abandon is recorded at the abandon time seen by the server, at the server's speed", async () => {
    const { code, roomId, host, textChars } = await raced("Times_Abandon", 65_000, null);
    const [row] = await t.db.select({ launchedAt: rooms.launchedAt }).from(rooms).where(eq(rooms.id, roomId));
    await t.db.update(roomMembers).set({ progress: 0.5, abandonedAt: new Date(row!.launchedAt!.getTime() + COUNTDOWN_MS + 30_000) }).where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.memberKey, host.key)));
    const res = await post({ room: code, summary: SUMMARY, players: [{ ...result("Times_Abandon", 250, 5), finished: false }] }, host.cookie);
    expect(res.status).toBe(201);
    const mine = await stored(((await res.json()) as { raceId: number }).raceId, "Times_Abandon");
    expect(mine.seconds).toBeCloseTo(30, 1);
    expect(mine.wpm).toBeLessThan(Math.round(textChars / 5 / 0.5));
  });

  test("another human of the room, kept with the race only, is corrected too", async () => {
    const { code, roomId, host, textChars } = await raced("Times_Hote", 65_000, 60_000);
    const other = await t.signUp("Times_Autre");
    // l'autre membre entre en course après le lancement : on l'ajoute comme participant et le serveur l'a vu arriver à 30 s
    const [row] = await t.db.select({ launchedAt: rooms.launchedAt }).from(rooms).where(eq(rooms.id, roomId));
    await t.db.insert(roomMembers).values({ roomId, memberKey: `player:${other.playerId}`, playerId: other.playerId, role: "player", seat: 5, progress: 1, finishedAt: new Date(row!.launchedAt!.getTime() + COUNTDOWN_MS + 30_000) });
    const res = await post({ room: code, summary: SUMMARY, players: [result("Times_Autre", 299, 3), result("Times_Hote", 20, 60)] }, host.cookie);
    expect(res.status).toBe(201);
    const [race] = await t.db.select({ others: racesTable.others }).from(racesTable).where(eq(racesTable.id, ((await res.json()) as { raceId: number }).raceId));
    const autre = race!.others.find((o) => o.name === "Times_Autre")!;
    expect(autre.seconds).toBeCloseTo(30, 1);
    expect(autre.wpm).toBe(Math.round(textChars / 5 / 0.5));
  });

  test("accuracy above 100 and a raw speed below the net speed are refused or raised", async () => {
    const { code, host, textChars } = await raced("Times_Brut", 65_000, 60_000);
    const net = Math.round(textChars / 5);
    const over = await post({ room: code, summary: SUMMARY, players: [{ ...result("Times_Brut", net, 60), accuracy: 140 }] }, host.cookie);
    expect(over.status).toBe(400);
    const res = await post({ room: code, summary: SUMMARY, players: [{ ...result("Times_Brut", net, 60), raw: 1 }] }, host.cookie);
    expect(res.status).toBe(201);
    const mine = await stored(((await res.json()) as { raceId: number }).raceId, "Times_Brut");
    expect(mine.raw).toBe(mine.wpm);
  });
});
