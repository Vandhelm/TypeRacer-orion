import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq, sql } from "drizzle-orm";
import { players, raceConfigs, roomMembers, rooms } from "../../db/schema";
import { leaveAfterDisconnect, MEMBER_AWAY_MS, raceDeadlineMs } from "./rooms";
import { roomsFixture } from "./rooms.fixture";

type Fixture = Awaited<ReturnType<typeof roomsFixture>>;

/** Recule l'arrivée d'un membre (`agoMs` avant maintenant) : l'ordre d'ancienneté ne dépend pas de la vitesse du test. */
const arrivedAgo = (t: Fixture, key: string, agoMs: number) => t.db.update(roomMembers).set({ joinedAt: sql`now() - ${agoMs} * interval '1 millisecond'` }).where(eq(roomMembers.memberKey, key));
/** Le dernier signe de vie d'un membre, `agoMs` avant maintenant : son onglet est fermé depuis ce temps. */
const silentFor = (t: Fixture, key: string, agoMs: number) => t.db.update(roomMembers).set({ lastSeenAt: sql`now() - ${agoMs} * interval '1 millisecond'` }).where(eq(roomMembers.memberKey, key));
const roomRow = async (t: Fixture, code: string) => (await t.db.select().from(rooms).where(eq(rooms.code, code)))[0]!;
const keysOf = async (t: Fixture, code: string) => (await t.db.select({ key: roomMembers.memberKey }).from(roomMembers).innerJoin(rooms, eq(rooms.id, roomMembers.roomId)).where(eq(rooms.code, code))).map((m) => m.key);

describe("SALLE-08 — when the host leaves, the longest-present connected human becomes host; with none, the room closes", () => {
  let t: Fixture;
  beforeAll(async () => {
    t = await roomsFixture();
  });

  test("the host leaves with A (arrived first) and B (after): A becomes host, and only A can now launch", async () => {
    const { room, host } = await t.open("Trans_Hote");
    const a = await t.signUp("Trans_A");
    const b = await t.signUp("Trans_B");
    const ka = (await t.join(a.cookie, { code: room.code })).body.you;
    const kb = (await t.join(b.cookie, { code: room.code })).body.you;
    await arrivedAgo(t, ka, 20_000);
    await arrivedAgo(t, kb, 10_000);
    expect((await t.call("POST", `/api/rooms/${room.code}/leave`, host.cookie)).status).toBe(200);
    expect((await roomRow(t, room.code)).hostId).toBe(a.playerId);
    const view = await t.read(b.cookie, room.code);
    expect(view.body.room.host).toBe(ka);
    expect(view.body.room.members.find((m) => m.key === ka)?.host).toBe(true);
    expect((await t.call("POST", `/api/rooms/${room.code}/launch`, b.cookie)).status).toBe(403);
    expect((await t.call("PATCH", `/api/rooms/${room.code}`, a.cookie, { settings: { language: "en" } })).status).toBe(200);
    expect((await t.call("POST", `/api/rooms/${room.code}/launch`, a.cookie)).status).toBe(200);
  });

  test("a connected spectator who arrived before A becomes host, spectator or not", async () => {
    const { room, host } = await t.open("Trans_Hote2");
    const a = await t.signUp("Trans_A2");
    const c = await t.signUp("Trans_Spect");
    const ka = (await t.join(a.cookie, { code: room.code })).body.you;
    const kc = (await t.join(c.cookie, { code: room.code, role: "spectator" })).body.you;
    await arrivedAgo(t, kc, 30_000);
    await arrivedAgo(t, ka, 20_000);
    await t.call("POST", `/api/rooms/${room.code}/leave`, host.cookie);
    expect((await roomRow(t, room.code)).hostId).toBe(c.playerId);
    expect((await t.read(c.cookie, room.code)).body.room.members.find((m) => m.key === kc)).toMatchObject({ host: true, role: "spectator" });
  });

  test("an older member who is no longer connected is skipped (and removed); the next connected human gets the role", async () => {
    const { room, host } = await t.open("Trans_Hote3");
    const gone = await t.signUp("Trans_Parti");
    const a = await t.signUp("Trans_A3");
    const kg = (await t.join(gone.cookie, { code: room.code })).body.you;
    const ka = (await t.join(a.cookie, { code: room.code })).body.you;
    await arrivedAgo(t, kg, 60_000);
    await arrivedAgo(t, ka, 30_000);
    await silentFor(t, kg, MEMBER_AWAY_MS + 1_000);
    await t.call("POST", `/api/rooms/${room.code}/leave`, host.cookie);
    expect((await roomRow(t, room.code)).hostId).toBe(a.playerId);
    expect(await keysOf(t, room.code)).toEqual([ka]);
  });

  test("only guests and bots remain: the room closes and frees them for another room", async () => {
    const { room, host } = await t.open("Trans_Seul");
    const g = t.guest("Invite_Reste");
    await t.join(g, { code: room.code });
    const [bot] = await t.db.select({ id: players.id }).from(players).where(and(eq(players.isBot, true), eq(players.name, "Ebi_Fry")));
    const botId = bot?.id ?? (await t.db.insert(players).values({ name: "Ebi_Fry", isBot: true }).returning({ id: players.id }))[0]!.id;
    const { id } = await roomRow(t, room.code);
    await t.db.insert(roomMembers).values({ roomId: id, memberKey: `player:${botId}`, playerId: botId, role: "spectator" });
    expect((await t.call("POST", `/api/rooms/${room.code}/leave`, host.cookie)).status).toBe(200);
    expect((await roomRow(t, room.code)).status).toBe("closed");
    expect(await keysOf(t, room.code)).toEqual([]);
    expect((await t.read(g, room.code)).status).toBe(404);
    const other = await t.open("Trans_Ailleurs");
    expect((await t.join(g, { code: other.room.code })).status).toBe(200);
  });

  test("the host whose tab closed (socket timed out) hands the role over the same way", async () => {
    const { room, host } = await t.open("Trans_Socket");
    const a = await t.signUp("Trans_A4");
    await t.join(a.cookie, { code: room.code });
    const who = { kind: "account" as const, playerId: host.playerId, name: "Trans_Socket" };
    expect((await leaveAfterDisconnect(t.db, room.code, who)).left).toBe(true);
    expect((await roomRow(t, room.code)).hostId).toBe(a.playerId);
  });

  test("the host who stops answering (no socket, no request) is replaced once their presence expires", async () => {
    const { room, host } = await t.open("Trans_Muet");
    const a = await t.signUp("Trans_A5");
    const ka = (await t.join(a.cookie, { code: room.code })).body.you;
    await silentFor(t, host.key, MEMBER_AWAY_MS + 1_000);
    const view = await t.read(a.cookie, room.code);
    expect(view.body.room.host).toBe(ka);
    expect(view.body.room.members.map((m) => m.key)).toEqual([ka]);
  });
});

describe("SALLE-08 / SALLE-09 — presence is per member, without sockets; a race follows its own duration", () => {
  let t: Fixture;
  const launchedAgo = (code: string, ms: number) => t.db.update(rooms).set({ launchedAt: sql`now() - ${ms} * interval '1 millisecond'` }).where(eq(rooms.code, code));
  beforeAll(async () => {
    t = await roomsFixture();
  });

  test("a member who left during a race without « Quitter » is removed after the delay, and the next race is not held", async () => {
    const { room, host } = await t.open("Pres_Hote");
    const cookie = t.guest("Fantome_Course");
    const { body } = await t.join(cookie, { code: room.code });
    expect((await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie)).status).toBe(200);
    await t.call("POST", `/api/rooms/${room.code}/finish`, host.cookie);
    // il ferme l'onglet : ni socket, ni requête
    await silentFor(t, body.you, MEMBER_AWAY_MS + 1_000);
    const view = await t.read(host.cookie, room.code);
    expect(view.body.room.members.map((m) => m.key)).not.toContain(body.you);
    expect(view.body.room.status).toBe("results");
    expect((await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie)).status).toBe(200);
    await t.call("POST", `/api/rooms/${room.code}/finish`, host.cookie);
    expect((await roomRow(t, room.code)).status).toBe("results");
  });

  test("a member who keeps reading the room (polling, /game, /podium) stays, even well past the delay", async () => {
    const { room, host } = await t.open("Pres_Vivant");
    const cookie = t.guest("Toujours_La");
    const { body } = await t.join(cookie, { code: room.code });
    await silentFor(t, body.you, MEMBER_AWAY_MS - 5_000);
    expect((await t.read(cookie, room.code)).status).toBe(200);
    await silentFor(t, host.key, 0);
    await t.read(host.cookie, room.code);
    expect(await keysOf(t, room.code)).toContain(body.you);
  });

  test("a member still within the delay is kept", async () => {
    const { room, host } = await t.open("Pres_Delai");
    const cookie = t.guest("Bientot_Parti");
    const { body } = await t.join(cookie, { code: room.code });
    await silentFor(t, body.you, MEMBER_AWAY_MS - 5_000);
    await t.read(host.cookie, room.code);
    expect(await keysOf(t, room.code)).toContain(body.you);
  });

  test("the race deadline follows race_configs.duration (plus the countdown margin), not a fixed 15 minutes", async () => {
    const { room, host } = await t.open("Pres_Duree", { duration: 30 });
    const cookie = t.guest("Lent");
    await t.join(cookie, { code: room.code });
    await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie);
    await launchedAgo(room.code, raceDeadlineMs(30) - 2_000);
    expect((await t.read(host.cookie, room.code)).body.room.status).toBe("racing");
    await launchedAgo(room.code, raceDeadlineMs(30) + 1_000);
    expect((await t.read(host.cookie, room.code)).body.room.status).toBe("results");
    expect(raceDeadlineMs(30)).toBeLessThan(raceDeadlineMs(600));
    expect(raceDeadlineMs(30)).toBeLessThan(2 * 60_000);
  });

  test("a race keeps the duration it was launched with, even if a setting changes afterwards", async () => {
    const { room, host } = await t.open("Pres_Fige", { duration: 600 });
    await t.join(t.guest("Coureur_Fige"), { code: room.code });
    await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie);
    const { configId } = await roomRow(t, room.code);
    const [config] = await t.db.select({ duration: raceConfigs.duration }).from(raceConfigs).where(eq(raceConfigs.id, configId));
    expect(config!.duration).toBe(600);
    await launchedAgo(room.code, raceDeadlineMs(120) + 1_000);
    expect((await t.read(host.cookie, room.code)).body.room.status).toBe("racing");
  });

  test("the explorer does not list a public room whose members all went silent: it is closed", async () => {
    const { room, host } = await t.open("Pres_Explo");
    await silentFor(t, host.key, MEMBER_AWAY_MS + 1_000);
    const listed = (await (await t.call("GET", "/api/rooms")).json()) as { rooms: { code: string }[] };
    expect(listed.rooms.map((r) => r.code)).not.toContain(room.code);
    expect((await roomRow(t, room.code)).status).toBe("closed");
  });
});
