import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createMockDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { createAuth } from "./auth";
import { GUEST_COOKIE, signGuest } from "./guest";
import { createRealtime } from "./realtime";
import { roomEvents } from "./room-events";
import { handleRoomsApi } from "./rooms-api";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
const SECRET = "guest-secret-guest-secret-guest-secret";

const LEAVE_AFTER_MS = 50;

type Message = { type: string; room?: { code: string; members: { key: string }[] }; reason?: string };

/** Ouvre une socket et range ses messages ; next() attend le prochain. */
function connect(url: string, cookie?: string) {
  const ws = new WebSocket(url, { headers: cookie ? { cookie } : {} } as unknown as string[]);
  const queue: Message[] = [];
  const waiting: ((m: Message) => void)[] = [];
  ws.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as Message;
    const resolve = waiting.shift();
    if (resolve) resolve(message);
    else queue.push(message);
  };
  const closed = new Promise<number>((resolve) => (ws.onclose = (event) => resolve(event.code)));
  const next = () => new Promise<Message>((resolve) => (queue.length ? resolve(queue.shift()!) : waiting.push(resolve)));
  return { ws, next, closed };
}

describe("SALLE-03 — members are pushed in real time over a WebSocket", () => {
  let server: ReturnType<typeof Bun.serve>;
  let call: (method: string, path: string, cookie?: string, body?: unknown) => Promise<Response>;
  let hostCookie: string;
  let code: string;
  // un invité garde son cookie : le même pseudo signé une autre fois est une autre session (SALLE-03)
  const sessions = new Map<string, string>();
  const freshGuest = (name: string) => `${GUEST_COOKIE}=${signGuest(name, SECRET)}`;
  const guest = (name: string) => sessions.get(name) ?? sessions.set(name, freshGuest(name)).get(name)!;

  beforeAll(async () => {
    const db = await createMockDatabase();
    const auth = createAuth(db);
    const realtime = createRealtime({ db, auth, secret: SECRET, events: roomEvents, leaveAfterMs: LEAVE_AFTER_MS });
    server = Bun.serve({
      port: 0,
      fetch: (req, srv) => (realtime.matches(req) ? realtime.upgrade(req, srv) : new Response("not found", { status: 404 })),
      websocket: realtime.websocket,
    });
    call = (method, path, cookie, body) =>
      handleRoomsApi(new Request(`http://localhost${path}`, { method, headers: { ...(cookie ? { cookie } : {}), "content-type": "application/json", "x-forwarded-for": "203.0.113.1" }, body: body === undefined ? undefined : JSON.stringify(body) }), db, auth, SECRET, roomEvents.emit);
    await auth.api.signUpEmail({ body: { name: "Hote_Direct", email: placeholderEmail("Hote_Direct"), password: "sushi-roll-42", username: "Hote_Direct", displayUsername: "Hote_Direct" } });
    const { headers } = await auth.api.signInUsername({ body: { username: "Hote_Direct", password: "sushi-roll-42" }, returnHeaders: true });
    hostCookie = headers.get("set-cookie")!.split(";")[0]!;
    code = ((await (await call("POST", "/api/rooms", hostCookie, { role: "player", settings: { visibility: "public" } })).json()) as { room: { code: string } }).room.code;
  });
  afterAll(() => server.stop(true));

  const url = (path: string) => `ws://localhost:${server.port}${path}`;

  test("a member receives the room, then each new member as they join", async () => {
    const socket = connect(url(`/ws/rooms/${code}`), hostCookie);
    const first = await socket.next();
    expect(first.type).toBe("room");
    expect(first.room!.members).toHaveLength(1);
    const { you } = (await (await call("POST", "/api/rooms/join", guest("Nageur_Live"), { code })).json()) as { you: string };
    const second = await socket.next();
    expect(second.room!.members.map((m) => m.key)).toContain(you);
    socket.ws.close();
  });

  test("a socket without a session, or from someone not in the room, is refused", async () => {
    expect((await connect(url(`/ws/rooms/${code}`)).closed)).not.toBe(1000);
    expect((await connect(url(`/ws/rooms/${code}`), guest("Intrus_Live")).closed)).not.toBe(1000);
  });

  test("closing the last socket of a member makes them leave the room", async () => {
    const { you } = (await (await call("POST", "/api/rooms/join", guest("Ephemere"), { code })).json()) as { you: string };
    const host = connect(url(`/ws/rooms/${code}`), hostCookie);
    await host.next();
    const visitor = connect(url(`/ws/rooms/${code}`), guest("Ephemere"));
    await visitor.next();
    visitor.ws.close();
    let seen = await host.next();
    while (seen.room!.members.some((m) => m.key === you)) seen = await host.next();
    expect(seen.room!.members.map((m) => m.key)).not.toContain(you);
    host.ws.close();
  });

  test("another cookie with the same guest nickname cannot open a member's socket", async () => {
    const invite = ((await (await call("POST", `/api/rooms/${code}/invites`, hostCookie)).json()) as { invite: { token: string } }).invite.token; // SALLE-04
    expect((await call("POST", "/api/rooms/join", guest("Bob"), { invite })).status).toBe(200);
    expect(await connect(url(`/ws/rooms/${code}`), freshGuest("bob")).closed).not.toBe(1000);
    const bob = connect(url(`/ws/rooms/${code}`), guest("Bob"));
    expect((await bob.next()).type).toBe("room");
    bob.ws.close();
  });

  test("SALLE-09 — once launched, closing every socket (going to /game) neither removes members nor closes the room", async () => {
    const racing = ((await (await call("POST", "/api/rooms", hostCookie, { role: "player", settings: { visibility: "public" } })).json()) as { room: { code: string } }).room.code;
    await call("POST", "/api/rooms/join", guest("Coureur_Live"), { code: racing });
    const sockets = [connect(url(`/ws/rooms/${racing}`), hostCookie), connect(url(`/ws/rooms/${racing}`), guest("Coureur_Live"))];
    await Promise.all(sockets.map((s) => s.next()));
    expect((await call("POST", `/api/rooms/${racing}/launch`, hostCookie)).status).toBe(200);
    for (const s of sockets) s.ws.close();
    await Bun.sleep(LEAVE_AFTER_MS * 4);
    const room = (await (await call("GET", `/api/rooms/${racing}`, hostCookie)).json()) as { room: { status: string; members: unknown[] } };
    expect(room.room.status).toBe("racing");
    expect(room.room.members).toHaveLength(2);
  });
});

describe("SALLE-09 — going from the room to the race never costs a member their seat", () => {
  const AWAY_MS = 400;
  let server: ReturnType<typeof Bun.serve>;
  let call: (method: string, path: string, cookie?: string, body?: unknown) => Promise<Response>;
  let hostCookie: string;
  const runner = `${GUEST_COOKIE}=${signGuest("Sprinteur", SECRET)}`;

  beforeAll(async () => {
    const db = await createMockDatabase();
    const auth = createAuth(db);
    const realtime = createRealtime({ db, auth, secret: SECRET, events: roomEvents, leaveAfterMs: AWAY_MS });
    server = Bun.serve({ port: 0, fetch: (req, srv) => (realtime.matches(req) ? realtime.upgrade(req, srv) : new Response("not found", { status: 404 })), websocket: realtime.websocket });
    call = (method, path, cookie, body) =>
      handleRoomsApi(new Request(`http://localhost${path}`, { method, headers: { ...(cookie ? { cookie } : {}), "content-type": "application/json", "x-forwarded-for": "203.0.113.1" }, body: body === undefined ? undefined : JSON.stringify(body) }), db, auth, SECRET, roomEvents.emit);
    await auth.api.signUpEmail({ body: { name: "Hote_Sprint", email: placeholderEmail("Hote_Sprint"), password: "sushi-roll-42", username: "Hote_Sprint", displayUsername: "Hote_Sprint" } });
    const { headers } = await auth.api.signInUsername({ body: { username: "Hote_Sprint", password: "sushi-roll-42" }, returnHeaders: true });
    hostCookie = headers.get("set-cookie")!.split(";")[0]!;
  });
  afterAll(() => server.stop(true));

  test("the socket closes while waiting, the race is launched and finished before the delay: the member stays", async () => {
    const created = (await (await call("POST", "/api/rooms", hostCookie, { role: "player" })).json()) as { room: { code: string } };
    const code = created.room.code;
    const invite = ((await (await call("POST", `/api/rooms/${code}/invites`, hostCookie)).json()) as { invite: { token: string } }).invite.token; // SALLE-04
    const { you } = (await (await call("POST", "/api/rooms/join", runner, { invite })).json()) as { you: string };
    const socket = connect(`ws://localhost:${server.port}/ws/rooms/${code}`, runner);
    await socket.next();
    socket.ws.close();
    await socket.closed;
    expect((await call("POST", `/api/rooms/${code}/launch`, hostCookie)).status).toBe(200);
    await call("POST", `/api/rooms/${code}/finish`, hostCookie);
    await call("POST", `/api/rooms/${code}/finish`, runner);
    await Bun.sleep(AWAY_MS * 3);
    const room = (await (await call("GET", `/api/rooms/${code}`, hostCookie)).json()) as { room: { status: string; members: { key: string }[] } };
    expect(room.room.status).toBe("results");
    expect(room.room.members.map((m) => m.key)).toContain(you);
    // dans une salle privée, « retour au salon » passe par le code : le membre y est toujours
    expect((await call("POST", "/api/rooms/join", runner, { code })).status).toBe(200);
  });
});
