// SEC-01 : le temps réel n'accepte aucune action d'hôte. Lancer, expulser, fermer passent par les routes HTTP, sous le
// verrou du salon ; sur une socket, même celle de l'hôte, ces messages sont refusés par le schéma et rien ne change.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Server } from "bun";
import { eq } from "drizzle-orm";
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
const TICKET_SECRET = "realtime-secret-realtime-secret-sec01";
const ENV = { GUEST_SESSION_SECRET: SECRET, REALTIME_SECRET: TICKET_SECRET };

describe("SEC-01 — the real-time server accepts no host action", () => {
  let db: Awaited<ReturnType<typeof createMockDatabase>>;
  let auth: ReturnType<typeof createAuth>;
  let server: Server<unknown>;
  const call = (method: string, path: string, cookie: string, body?: unknown) =>
    handleRoomsApi(
      new Request(`http://localhost${path}`, { method, headers: { cookie, "content-type": "application/json", "x-forwarded-for": "203.0.113.1" }, body: body === undefined ? undefined : JSON.stringify(body) }),
      db,
      auth,
      SECRET,
      events.emit,
      undefined,
      { env: { TRUST_PROXY: "1" } },
    );
  const events = memoryRoomEvents();
  const signUp = async (name: string) => {
    await auth.api.signUpEmail({ body: { name, email: placeholderEmail(name), password: "sushi-roll-42", username: name, displayUsername: name } });
    const { headers } = await auth.api.signInUsername({ body: { username: name, password: "sushi-roll-42" }, returnHeaders: true });
    return headers.get("set-cookie")!.split(";")[0]!;
  };
  /** Une socket qui suit le salon comme la page salle ; garde tout ce qu'elle reçoit. */
  const tab = async (code: string, cookie: string) => {
    const grant = await handleRealtimeTicket(new Request("http://localhost/api/realtime/ticket", { method: "POST", headers: { cookie } }), auth, ENV);
    const { ticket } = (await grant.json()) as { ticket: string };
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/?ticket=${encodeURIComponent(ticket)}`);
    const messages: ServerMessage[] = [];
    await new Promise<void>((resolve) => {
      ws.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as ServerMessage;
        messages.push(message);
        if (message.type === "welcome") ws.send(JSON.stringify({ type: "join", room: code, follow: true }));
        if (message.type === "room") resolve();
      };
    });
    return { ws, messages, send: (message: unknown) => ws.send(JSON.stringify(message)) };
  };
  const stateOf = async (code: string) => {
    const [room] = await db.select({ id: rooms.id, status: rooms.status, hostId: rooms.hostId, launchedAt: rooms.launchedAt }).from(rooms).where(eq(rooms.code, code));
    const members = (await db.select({ key: roomMembers.memberKey }).from(roomMembers).where(eq(roomMembers.roomId, room!.id))).map((m) => m.key).sort();
    return { room, members };
  };

  beforeAll(async () => {
    db = await createMockDatabase();
    auth = createAuth(db);
    server = createRealtimeServer({ port: 0, hostname: "127.0.0.1", secret: TICKET_SECRET, rooms: createRoomBackend(db, events) });
  });
  afterAll(() => {
    server.stop(true);
  });

  test("launch, kick and close sent on a member's socket, and on the host's: invalid_message each time, nothing changes", async () => {
    const hostCookie = await signUp("Hote_Socket");
    const memberCookie = await signUp("Membre_Socket");
    const created = (await (await call("POST", "/api/rooms", hostCookie, { role: "player", settings: { visibility: "public" } })).json()) as { room: { code: string }; you: string };
    const code = created.room.code;
    expect((await call("POST", "/api/rooms/join", memberCookie, { code })).status).toBe(200);
    const before = await stateOf(code);
    const member = await tab(code, memberCookie);
    const host = await tab(code, hostCookie);
    const actions: unknown[] = [{ type: "launch" }, { type: "kick" }, { type: "close" }, { type: "kick", member: created.you }, { type: "launch", room: code }, { type: "close", room: code }];
    for (const socket of [member, host]) for (const action of actions) socket.send(action);
    await Bun.sleep(300);
    for (const socket of [member, host]) {
      const errors = socket.messages.filter((m) => m.type === "error").map((m) => (m as { code: string }).code);
      expect(errors).toEqual(actions.map(() => "invalid_message"));
      expect(socket.messages.some((m) => m.type === "closed" || m.type === "standings")).toBe(false);
    }
    expect(await stateOf(code)).toEqual(before);
    expect(before.room!.status).toBe("waiting");
    expect(before.members).toHaveLength(2);
    member.ws.close();
    host.ws.close();
  });
});
