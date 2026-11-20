// COURSE-06 : en mode fatal, la page annonce son élimination au temps réel, qui la date (heure de la base) et la garde
// (room_members.eliminated_at) avec la progression validée à ce moment ; l'enregistrement de la course s'y fie.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, sql } from "drizzle-orm";
import { roomMembers, rooms } from "../../db/schema";
import { createMockDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { createAuth } from "../server/auth";
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

describe("COURSE-06 — the realtime server dates and keeps an elimination", () => {
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
  /** Un salon sans bots, lancé il y a 30 s (la course a commencé), sans limite de temps. */
  const launched = async (name: string, mistakes: "fatal" | "fix") => {
    const host = await signUp(name);
    const created = await call("POST", "/api/rooms", host, { role: "player", settings: { visibility: "public", bots: false, guests: 3, duration: null, mistakes } });
    const { room, you } = (await created.json()) as { room: { code: string }; you: string };
    // un seul humain sans bots : on ajoute un second coureur pour pouvoir lancer
    const other = await signUp(`${name}_2`);
    expect((await call("POST", "/api/rooms/join", other, { code: room.code })).status).toBe(200);
    expect((await call("POST", `/api/rooms/${room.code}/launch`, host)).status).toBe(200);
    await db.update(rooms).set({ launchedAt: sql`now() - interval '30 seconds'` }).where(eq(rooms.code, room.code));
    return { code: room.code, host, key: you };
  };
  const stored = async (code: string, key: string) => {
    const [room] = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.code, code));
    return (await db.select({ progress: roomMembers.progress, eliminatedAt: roomMembers.eliminatedAt }).from(roomMembers).where(and(eq(roomMembers.roomId, room!.id), eq(roomMembers.memberKey, key))))[0]!;
  };

  test("an elimination in fatal mode is dated by the server, with the progress validated then; later progress is not kept", async () => {
    const { code, host, key } = await launched("Elimine_Hote", "fatal");
    const page = await racePage(code, host);
    page.send({ type: "progress", progress: 0.3, wpm: 40 });
    await page.until(() => validated(page.messages, 0.3));
    const before = Date.now();
    page.send({ type: "eliminated" });
    for (let i = 0; i < 200 && !(await stored(code, key)).eliminatedAt; i++) await Bun.sleep(10);
    const row = await stored(code, key);
    expect(row.eliminatedAt).not.toBeNull();
    expect(Math.abs(row.eliminatedAt!.getTime() - before)).toBeLessThan(2000);
    expect(row.progress).toBeCloseTo(0.3);
    // une progression après l'élimination n'est plus gardée, ni à la fermeture de la page
    page.send({ type: "progress", progress: 0.4, wpm: 40 });
    await Bun.sleep(200);
    page.ws.close();
    await Bun.sleep(200);
    expect((await stored(code, key)).progress).toBeCloseTo(0.3);
  });

  test("outside the fatal mode, an elimination is not kept", async () => {
    const { code, host, key } = await launched("Elimine_Libre", "fix");
    const page = await racePage(code, host);
    page.send({ type: "progress", progress: 0.3, wpm: 40 });
    await page.until(() => validated(page.messages, 0.3));
    page.send({ type: "eliminated" });
    await Bun.sleep(300);
    expect((await stored(code, key)).eliminatedAt).toBeNull();
    page.ws.close();
  });
});
