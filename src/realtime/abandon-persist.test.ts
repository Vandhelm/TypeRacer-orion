// COURSE-07 : à l'abandon, la base reçoit la dernière progression validée par l'arbitre du temps réel (pas 0).
// Un vrai serveur temps réel sur une base de test ; l'abandon passe par la route HTTP, qui le prévient (NOTIFY).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, sql } from "drizzle-orm";
import { roomMembers, rooms } from "../../db/schema";
import { withoutBotCourse } from "../server/races.fixture";
import { createMockDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { createAuth } from "../server/auth";
import { GUEST_COOKIE, signGuest } from "../server/guest";
import { handleRealtimeTicket } from "../server/realtime-ticket";
import { memoryRoomEvents } from "../server/room-events";
import { handleRoomsApi } from "../server/rooms-api";
import type { ServerMessage } from "./protocol";
import { createRoomBackend } from "./room-backend";
import { createRealtimeServer } from "./server";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
const SECRET = "guest-secret-guest-secret-guest-secret";
const TICKET_SECRET = "realtime-secret-realtime-secret-realtime";
const ENV = { GUEST_SESSION_SECRET: SECRET, REALTIME_SECRET: TICKET_SECRET };

describe("COURSE-07 — the abandon keeps the progress validated by the realtime server", () => {
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
  /** La page de course : ticket, puis join (sans follow). */
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
  /** Un salon lancé il y a 30 s (la course a commencé), sans limite de temps. */
  const launched = async (name: string, bots: boolean, guestName?: string) => {
    const host = await signUp(name);
    const { room } = (await (await call("POST", "/api/rooms", host, { role: "player", settings: { visibility: "public", bots, guests: 3, duration: null } })).json()) as { room: { code: string } };
    const guest = guestName ? `${GUEST_COOKIE}=${signGuest(guestName, SECRET)}` : null;
    if (guest) expect((await call("POST", "/api/rooms/join", guest, { code: room.code })).status).toBe(200);
    expect((await call("POST", `/api/rooms/${room.code}/launch`, host)).status).toBe(200);
    await db.update(rooms).set({ launchedAt: sql`now() - interval '30 seconds'` }).where(eq(rooms.code, room.code));
    return { code: room.code, host, guest };
  };
  const storedProgress = async (code: string, key: string) => {
    const [room] = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.code, code));
    return (await db.select({ progress: roomMembers.progress, abandonedAt: roomMembers.abandonedAt }).from(roomMembers).where(and(eq(roomMembers.roomId, room!.id), eq(roomMembers.memberKey, key))))[0]!;
  };
  const eventually = async (read: () => Promise<number>, expected: number) => {
    let value = await read();
    for (let i = 0; i < 100 && Math.abs(value - expected) > 0.01; i++) {
      await Bun.sleep(10);
      value = await read();
    }
    return value;
  };

  test("a runner abandons mid-race after 0.3 validated: the room keeps 0.3, the race goes on", async () => {
    const { code, guest } = await launched("Garde_Hote", false, "Garde_Invite");
    const page = await racePage(code, guest!);
    page.send({ type: "progress", progress: 0.3, wpm: 40 });
    await page.until(() => validated(page.messages, 0.3));
    expect(validated(page.messages, 0.3)).toBe(true);
    const res = await call("POST", `/api/rooms/${code}/abandon`, guest!);
    const { you, room } = (await res.json()) as { you: string; room: { status: string } };
    expect(room.status).toBe("racing");
    expect(await eventually(async () => (await storedProgress(code, you)).progress, 0.3)).toBeCloseTo(0.3);
    page.ws.close();
  });

  test("the last runner abandons (the race ends): the room still keeps the validated progress", async () => {
    const { code, host } = await launched("Garde_Seul", true);
    await withoutBotCourse(db, code); // BOT-05 : des bots dont le serveur n'a pas la course ne retiennent pas la fin
    const page = await racePage(code, host);
    page.send({ type: "progress", progress: 0.3, wpm: 40 });
    await page.until(() => validated(page.messages, 0.3));
    const res = await call("POST", `/api/rooms/${code}/abandon`, host);
    const { you, room } = (await res.json()) as { you: string; room: { status: string } };
    expect(room.status).toBe("results");
    expect(await eventually(async () => (await storedProgress(code, you)).progress, 0.3)).toBeCloseTo(0.3);
    page.ws.close();
  });
});
