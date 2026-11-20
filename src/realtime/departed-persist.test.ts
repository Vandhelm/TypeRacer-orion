// COURSE-10 : un coureur qui quitte le salon en pleine course (bouton « Quitter », POST /leave) est classé parmi les
// non-terminés à la progression validée par l'arbitre du temps réel, même si elle n'était qu'en mémoire à son départ.
// Un vrai serveur temps réel sur une base de test, comme abandon-persist.test.ts.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { players, raceResults, races, rooms } from "../../db/schema";
import { withoutBotCourse } from "../server/races.fixture";
import { BOT_NAMES } from "../players/bots";
import { createMockDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { createAuth } from "../server/auth";
import { GUEST_COOKIE, signGuest } from "../server/guest";
import { handleRace } from "../server/races";
import { handleRealtimeTicket } from "../server/realtime-ticket";
import { memoryRoomEvents } from "../server/room-events";
import { handleRoomsApi } from "../server/rooms-api";
import { recordProgress } from "../server/rooms";
import type { ServerMessage } from "./protocol";
import { createRoomBackend } from "./room-backend";
import { createRealtimeServer } from "./server";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
const SECRET = "guest-secret-guest-secret-guest-secret";
const TICKET_SECRET = "realtime-secret-realtime-secret-realtime";
const ENV = { GUEST_SESSION_SECRET: SECRET, REALTIME_SECRET: TICKET_SECRET };
const SUMMARY = {
  textType: "words", language: "fr", duration: null, level: "common", punctuation: false, numbers: false, specials: false, accents: true,
  excluded: "", mistakes: "fix", botSpeed: "medium", botAccuracy: "high", length: "short", wordCount: 20, sessionSeconds: 90,
};
const result = (name: string, finished = false) => ({
  name, bot: false, wpm: 40, raw: 45, accuracy: 95, seconds: 5, chars: [80, 2, 0, 0], consistency: 80, idle: 0, finished, eliminated: false,
  wpmSeries: [40], rawSeries: [40], errorSeries: [0],
});

describe("COURSE-10 — a runner who leaves mid-race keeps the progress the realtime referee validated", () => {
  let db: Awaited<ReturnType<typeof createMockDatabase>>;
  let auth: ReturnType<typeof createAuth>;
  let server: ReturnType<typeof createRealtimeServer>;
  const events = memoryRoomEvents();
  beforeAll(async () => {
    db = await createMockDatabase();
    auth = createAuth(db);
    server = createRealtimeServer({ port: 0, hostname: "127.0.0.1", secret: TICKET_SECRET, rooms: createRoomBackend(db, events) });
  });
  afterAll(() => server.stop(true));

  const call = async (method: string, path: string, cookie: string, body?: unknown) =>
    handleRoomsApi(
      new Request(`http://localhost${path}`, { method, headers: { cookie, "content-type": "application/json", "x-forwarded-for": "203.0.113.1" }, body: body === undefined ? undefined : JSON.stringify(body) }),
      db, auth, SECRET, events.emit, undefined, { env: { TRUST_PROXY: "1" } },
    );
  const signUp = async (name: string) => {
    await auth.api.signUpEmail({ body: { name, email: placeholderEmail(name), password: "sushi-roll-42", username: name, displayUsername: name } });
    const { headers } = await auth.api.signInUsername({ body: { username: name, password: "sushi-roll-42" }, returnHeaders: true });
    return headers.get("set-cookie")!.split(";")[0]!;
  };
  const racePage = async (code: string, cookie: string) => {
    const grant = await handleRealtimeTicket(new Request("http://localhost/api/realtime/ticket", { method: "POST", headers: { cookie } }), auth, ENV);
    const { ticket } = (await grant.json()) as { ticket: string };
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/?ticket=${encodeURIComponent(ticket)}`);
    const messages: ServerMessage[] = [];
    ws.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      messages.push(message);
      if (message.type === "welcome") ws.send(JSON.stringify({ type: "join", room: code }));
    };
    const until = async (found: () => boolean) => {
      for (let i = 0; i < 200 && !found(); i++) await Bun.sleep(10);
    };
    await until(() => messages.some((m) => m.type === "standings"));
    return { ws, messages, until, send: (message: unknown) => ws.send(JSON.stringify(message)) };
  };
  const validated = (messages: ServerMessage[], progress: number) => messages.some((m) => m.type === "standings" && m.players.some((p) => Math.abs(p.progress - progress) < 1e-9));
  const departedProgress = async (code: string, name: string) => {
    const [room] = await db.select({ departed: rooms.departed }).from(rooms).where(eq(rooms.code, code));
    return room!.departed.find((d) => d.name === name)?.progress ?? -1;
  };
  const eventually = async (read: () => Promise<number>, expected: number) => {
    let value = await read();
    for (let i = 0; i < 200 && Math.abs(value - expected) > 0.01; i++) {
      await Bun.sleep(10);
      value = await read();
    }
    return value;
  };

  test("P leaves by the « Quitter » route at 0.4 validated in memory only: kept at 0.4, ranked before R (0.2) and after S (finished)", async () => {
    const host = await signUp("Quit_S");
    const { room } = (await (await call("POST", "/api/rooms", host, { role: "player", settings: { visibility: "public", bots: false, guests: 3, duration: null } })).json()) as { room: { code: string } };
    const code = room.code;
    const p = `${GUEST_COOKIE}=${signGuest("Quit_P", SECRET)}`;
    const r = `${GUEST_COOKIE}=${signGuest("Quit_R", SECRET)}`;
    expect((await call("POST", "/api/rooms/join", p, { code })).status).toBe(200);
    const joinedR = await call("POST", "/api/rooms/join", r, { code });
    const rKey = ((await joinedR.json()) as { you: string }).you;
    const sKey = ((await (await call("GET", `/api/rooms/${code}`, host)).json()) as { you: string }).you;
    expect((await call("POST", `/api/rooms/${code}/launch`, host)).status).toBe(200);
    await db.update(rooms).set({ launchedAt: sql`now() - interval '30 seconds'` }).where(eq(rooms.code, code));

    const page = await racePage(code, p);
    page.send({ type: "progress", progress: 0.4, wpm: 40 });
    await page.until(() => validated(page.messages, 0.4));
    expect(validated(page.messages, 0.4)).toBe(true);
    // la page quitte la course : POST /leave, puis sa socket se ferme
    expect((await call("POST", `/api/rooms/${code}/leave`, p)).status).toBe(200);
    page.ws.close();
    expect(await eventually(() => departedProgress(code, "Quit_P"), 0.4)).toBeCloseTo(0.4);

    await recordProgress(db, code, rKey, 0.2);
    await recordProgress(db, code, sKey, 1);
    const res = await handleRace(
      new Request("http://localhost/api/races", { method: "POST", headers: { "content-type": "application/json", cookie: host }, body: JSON.stringify({ id: crypto.randomUUID(), room: code, summary: SUMMARY, players: [result("Quit_R"), result("Quit_P"), result("Quit_S", true)] }) }),
      db, auth, SECRET,
    );
    expect(res.status).toBe(201);
    const { raceId } = (await res.json()) as { raceId: number };
    const [race] = await db.select({ others: races.others }).from(races).where(eq(races.id, raceId));
    expect(race!.others.map((o) => [o.name, o.rank])).toEqual([["Quit_P", 2], ["Quit_R", 3]]);
  });

  /** Un salon de l'hôte S (compte) et d'invités, lancé il y a 2 min, sans limite de temps. */
  const launchedWith = async (prefix: string, guests: string[], bots: boolean) => {
    const host = await signUp(`${prefix}_S`);
    const { room } = (await (await call("POST", "/api/rooms", host, { role: "player", settings: { visibility: "public", bots, guests: guests.length + 2, duration: null } })).json()) as { room: { code: string } };
    const cookies: string[] = [];
    for (const name of guests) {
      const cookie = `${GUEST_COOKIE}=${signGuest(name, SECRET)}`;
      expect((await call("POST", "/api/rooms/join", cookie, { code: room.code })).status).toBe(200);
      cookies.push(cookie);
    }
    const sKey = ((await (await call("GET", `/api/rooms/${room.code}`, host)).json()) as { you: string }).you;
    expect((await call("POST", `/api/rooms/${room.code}/launch`, host)).status).toBe(200);
    await db.update(rooms).set({ launchedAt: sql`now() - interval '120 seconds'` }).where(eq(rooms.code, room.code));
    return { code: room.code, host, sKey, cookies };
  };
  const post = async (code: string, cookie: string, players: unknown[]) => {
    const res = await handleRace(new Request("http://localhost/api/races", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ id: crypto.randomUUID(), room: code, summary: SUMMARY, players }) }), db, auth, SECRET);
    expect(res.status).toBe(201);
    return ((await res.json()) as { raceId: number }).raceId;
  };
  /** La page de course : progression validée, puis « Quitter » (POST /leave) et fermeture de sa socket. */
  const quitAt = async (code: string, cookie: string, progress: number) => {
    const page = await racePage(code, cookie);
    page.send({ type: "progress", progress, wpm: 40 });
    await page.until(() => validated(page.messages, progress));
    expect(validated(page.messages, progress)).toBe(true);
    expect((await call("POST", `/api/rooms/${code}/leave`, cookie)).status).toBe(200);
    page.ws.close();
  };
  const ranksOf = async (raceId: number) => {
    const [race] = await db.select({ others: races.others }).from(races).where(eq(races.id, raceId));
    const kept = await db.select({ name: players.name, rank: raceResults.rank }).from(raceResults).innerJoin(players, eq(players.id, raceResults.playerId)).where(eq(raceResults.raceId, raceId));
    return [...kept, ...race!.others.map((o) => ({ name: o.name, rank: o.rank }))].sort((a, b) => a.rank - b.rank).map((p) => p.name);
  };
  const eventuallyRanks = async (raceId: number, expected: string[]) => {
    let value = await ranksOf(raceId);
    for (let i = 0; i < 200 && value.join() !== expected.join(); i++) {
      await Bun.sleep(10);
      value = await ranksOf(raceId);
    }
    return value;
  };

  test("the last human leaves at 0.8 (the room goes to the results): kept at 0.8, ranked before the bot at 0.5", async () => {
    const { code, host, sKey, cookies } = await launchedWith("Last", ["Last_P"], true);
    // BOT-05 : un bot dont le serveur n'a pas la course (salon sans graine), classé par la progression du navigateur
    await withoutBotCourse(db, code);
    await recordProgress(db, code, sKey, 1);
    // S envoie sa course tout de suite : P court encore
    const raceId = await post(code, host, [result("Last_S", true), { ...result(BOT_NAMES[0]), bot: true, progress: 0.5 }, result("Last_P")]);
    await quitAt(code, cookies[0]!, 0.8);
    expect(await eventually(() => departedProgress(code, "Last_P"), 0.8)).toBeCloseTo(0.8);
    expect(await eventuallyRanks(raceId, ["Last_S", "Last_P", BOT_NAMES[0]])).toEqual(["Last_S", "Last_P", BOT_NAMES[0]]);
  });

  test("two leave, the last one at 0.8 after the first at 0.6: the last one ranks first among them", async () => {
    const { code, host, sKey, cookies } = await launchedWith("Two", ["Two_P1", "Two_P2"], false);
    await recordProgress(db, code, sKey, 1);
    const raceId = await post(code, host, [result("Two_S", true), result("Two_P1"), result("Two_P2")]);
    await quitAt(code, cookies[0]!, 0.6);
    await quitAt(code, cookies[1]!, 0.8);
    expect(await eventually(() => departedProgress(code, "Two_P2"), 0.8)).toBeCloseTo(0.8);
    expect(await eventuallyRanks(raceId, ["Two_S", "Two_P2", "Two_P1"])).toEqual(["Two_S", "Two_P2", "Two_P1"]);
  });
});
