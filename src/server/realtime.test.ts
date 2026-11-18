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
  const guest = (name: string) => `${GUEST_COOKIE}=${signGuest(name, SECRET)}`;

  beforeAll(async () => {
    const db = await createMockDatabase();
    const auth = createAuth(db);
    const realtime = createRealtime({ db, auth, secret: SECRET, events: roomEvents, leaveAfterMs: 50 });
    server = Bun.serve({
      port: 0,
      fetch: (req, srv) => (realtime.matches(req) ? realtime.upgrade(req, srv) : new Response("not found", { status: 404 })),
      websocket: realtime.websocket,
    });
    call = (method, path, cookie, body) =>
      handleRoomsApi(new Request(`http://localhost${path}`, { method, headers: { ...(cookie ? { cookie } : {}), "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }), db, auth, SECRET, roomEvents.emit);
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
    await call("POST", "/api/rooms/join", guest("Nageur_Live"), { code });
    const second = await socket.next();
    expect(second.room!.members.map((m) => m.key)).toContain("guest:nageur_live");
    socket.ws.close();
  });

  test("a socket without a session, or from someone not in the room, is refused", async () => {
    expect((await connect(url(`/ws/rooms/${code}`)).closed)).not.toBe(1000);
    expect((await connect(url(`/ws/rooms/${code}`), guest("Intrus_Live")).closed)).not.toBe(1000);
  });

  test("closing the last socket of a member makes them leave the room", async () => {
    await call("POST", "/api/rooms/join", guest("Ephemere"), { code });
    const host = connect(url(`/ws/rooms/${code}`), hostCookie);
    await host.next();
    const visitor = connect(url(`/ws/rooms/${code}`), guest("Ephemere"));
    await visitor.next();
    visitor.ws.close();
    let seen = await host.next();
    while (seen.room!.members.some((m) => m.key === "guest:ephemere")) seen = await host.next();
    expect(seen.room!.members.map((m) => m.key)).not.toContain("guest:ephemere");
    host.ws.close();
  });
});
