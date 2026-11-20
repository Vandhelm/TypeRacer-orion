// COURSE-08 : une progression acceptée par l'arbitre prouve que le coureur est là. Un onglet dont le navigateur ralentit
// les minuteries (relecture HTTP rare) n'est donc pas noté abandonné tant qu'il court. Vrai serveur temps réel, vraie base.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, sql } from "drizzle-orm";
import { roomMembers, rooms } from "../../db/schema";
import { createMockDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { createAuth } from "../server/auth";
import { GUEST_COOKIE, signGuest } from "../server/guest";
import { handleRealtimeTicket } from "../server/realtime-ticket";
import { memoryRoomEvents } from "../server/room-events";
import { handleRoomsApi } from "../server/rooms-api";
import type { ServerMessage } from "./protocol";
import { ABANDON_AFTER_MS } from "../server/rooms";
import { createRoomBackend } from "./room-backend";
import { createRealtimeServer } from "./server";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
const SECRET = "guest-secret-guest-secret-guest-secret";
const TICKET_SECRET = "realtime-secret-realtime-secret-realtime";
const ENV = { GUEST_SESSION_SECRET: SECRET, REALTIME_SECRET: TICKET_SECRET };
const REFRESH_MS = 30;

describe("COURSE-08 — an accepted progress is a sign of life", () => {
  let db: Awaited<ReturnType<typeof createMockDatabase>>;
  let auth: ReturnType<typeof createAuth>;
  let server: ReturnType<typeof createRealtimeServer>;
  const events = memoryRoomEvents();
  beforeAll(async () => {
    db = await createMockDatabase();
    auth = createAuth(db);
    server = createRealtimeServer({ port: 0, hostname: "127.0.0.1", secret: TICKET_SECRET, rooms: createRoomBackend(db, events), refreshMs: REFRESH_MS });
  });
  afterAll(() => server.stop(true));

  const call = async (method: string, path: string, cookie: string, body?: unknown) =>
    handleRoomsApi(
      new Request(`http://localhost${path}`, { method, headers: { cookie, "content-type": "application/json", "x-forwarded-for": "203.0.113.8" }, body: body === undefined ? undefined : JSON.stringify(body) }),
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
    for (let i = 0; i < 200 && !messages.some((m) => m.type === "standings"); i++) await Bun.sleep(10);
    return { ws, messages, send: (message: unknown) => ws.send(JSON.stringify(message)) };
  };
  /** Un salon lancé il y a 60 s, sans limite de temps : l'hôte (compte) et un invité. */
  const launched = async (name: string) => {
    const host = await signUp(name);
    const { room } = (await (await call("POST", "/api/rooms", host, { role: "player", settings: { visibility: "public", bots: false, guests: 3, duration: null } })).json()) as { room: { code: string } };
    const guest = `${GUEST_COOKIE}=${signGuest(`${name}_I`, SECRET)}`;
    const joined = (await (await call("POST", "/api/rooms/join", guest, { code: room.code })).json()) as { you: string };
    expect((await call("POST", `/api/rooms/${room.code}/launch`, host)).status).toBe(200);
    await db.update(rooms).set({ launchedAt: sql`now() - interval '60 seconds'` }).where(eq(rooms.code, room.code));
    return { code: room.code, guest, key: joined.you };
  };
  const member = async (code: string, key: string) => {
    const [room] = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.code, code));
    const [row] = await db
      .select({ abandonedAt: roomMembers.abandonedAt, silentMs: sql<number>`extract(epoch from now() - ${roomMembers.lastSeenAt}) * 1000`.mapWith(Number) })
      .from(roomMembers)
      .where(and(eq(roomMembers.roomId, room!.id), eq(roomMembers.memberKey, key)));
    return row!;
  };
  const silentFor = (key: string, ms: number) => db.update(roomMembers).set({ lastSeenAt: sql`now() - ${ms} * interval '1 millisecond'` }).where(eq(roomMembers.memberKey, key));

  test("31 s without any HTTP read but with accepted progress: not abandoned", async () => {
    const { code, guest, key } = await launched("Vivant_Onglet");
    const page = await racePage(code, guest);
    await silentFor(key, 25_000); // la dernière relecture HTTP date de 25 s
    page.send({ type: "progress", progress: 0.05, wpm: 40 });
    await Bun.sleep(REFRESH_MS * 5);
    const seen = await member(code, key);
    expect(seen.silentMs).toBeLessThan(5_000); // la progression a compté comme signe de vie
    // 6 s de plus sans relecture : 31 s depuis la dernière, mais la course continue
    await silentFor(key, seen.silentMs + 6_000);
    page.send({ type: "progress", progress: 0.1, wpm: 40 });
    await Bun.sleep(REFRESH_MS * 5);
    expect((await member(code, key)).abandonedAt).toBeNull();
    page.ws.close();
  });

  test("past the delay without HTTP read and without progress: abandoned by the realtime sweep, the page is told", async () => {
    const { code, guest, key } = await launched("Muet_Onglet");
    const page = await racePage(code, guest);
    await silentFor(key, ABANDON_AFTER_MS + 1_000);
    for (let i = 0; i < 100 && !(await member(code, key)).abandonedAt; i++) await Bun.sleep(10);
    expect((await member(code, key)).abandonedAt).not.toBeNull();
    await Bun.sleep(REFRESH_MS * 3);
    page.send({ type: "progress", progress: 0.05, wpm: 40 });
    for (let i = 0; i < 100 && !page.messages.some((m) => m.type === "error"); i++) await Bun.sleep(10);
    expect(page.messages.filter((m) => m.type === "error").map((m) => (m as { code: string }).code)).toContain("abandoned");
    page.ws.close();
  });
});
