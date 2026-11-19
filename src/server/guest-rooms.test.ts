// AUTH-03 : un invité ne crée de salon par aucun chemin — la page /room avec un code inexistant, la route de création,
// l'entrée par code, ni le join temps réel. Chaque test vérifie aussi la base : aucune ligne de salon ni de membre en plus.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { roomMembers, rooms } from "../../db/schema";
import { createMockDatabase } from "../../db/mocks/test-database";
import { createRoomBackend } from "../realtime/room-backend";
import { createRealtimeServer } from "../realtime/server";
import { arrivalOf } from "../views/room/room";
import { createAuth } from "./auth";
import { GUEST_COOKIE, signGuest } from "./guest";
import { handleRealtimeTicket } from "./realtime-ticket";
import { memoryRoomEvents } from "./room-events";
import { roomEntry } from "./room-gate";
import { handleRoomsApi } from "./rooms-api";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
const SECRET = "guest-secret-guest-secret-guest-secret";
const TICKET_SECRET = "realtime-secret-realtime-secret-realtime";
const ENV = { GUEST_SESSION_SECRET: SECRET, REALTIME_SECRET: TICKET_SECRET };
/** Bon format de code, mais aucun salon de la base de démo ne le porte. */
const MISSING = "ZZZZ99";

async function setup() {
  const db = await createMockDatabase();
  const auth = createAuth(db);
  const events = memoryRoomEvents();
  const server = createRealtimeServer({ port: 0, hostname: "127.0.0.1", secret: TICKET_SECRET, rooms: createRoomBackend(db, events) });
  const guest = (nickname: string) => `${GUEST_COOKIE}=${signGuest(nickname, SECRET)}`;
  const call = (method: string, path: string, cookie?: string, body?: unknown) =>
    handleRoomsApi(
      new Request(`http://localhost${path}`, {
        method,
        headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      db,
      auth,
      SECRET,
      events.emit,
    );
  const counts = async () => ({ rooms: await db.$count(rooms), members: await db.$count(roomMembers) });
  return { db, auth, server, guest, call, counts };
}

type Setup = Awaited<ReturnType<typeof setup>>;

/** Ouvre une connexion temps réel comme la page salle, envoie un join, et rend la première réponse sur ce salon. */
async function realtimeJoin(t: Setup, cookie: string, room: string, follow: boolean) {
  const grant = await handleRealtimeTicket(new Request("http://localhost/api/realtime/ticket", { method: "POST", headers: { cookie } }), t.auth, ENV);
  expect(grant.status).toBe(200);
  const { ticket } = (await grant.json()) as { ticket: string };
  const ws = new WebSocket(`ws://127.0.0.1:${t.server.port}/?ticket=${encodeURIComponent(ticket)}`);
  const reply = await new Promise<{ type: string; code?: string; room?: unknown }>((resolve) => {
    ws.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as { type: string; code?: string; room?: unknown };
      if (message.type === "welcome") ws.send(JSON.stringify({ type: "join", room, ...(follow ? { follow: true } : {}) }));
      else resolve(message);
    };
  });
  const closed = new Promise<void>((resolve) => (ws.onclose = () => resolve()));
  ws.close();
  await closed;
  return reply;
}

describe("AUTH-03 — a guest cannot create a room by any path", () => {
  let t: Setup;
  beforeAll(async () => {
    t = await setup();
  });
  afterAll(() => t.server.stop(true));

  test("POST /api/rooms by a guest is refused (403) and writes nothing", async () => {
    const before = await t.counts();
    const res = await t.call("POST", "/api/rooms", t.guest("Corail_418"), { role: "player" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "account_required" });
    expect(await t.counts()).toEqual(before);
  });

  test("a guest claiming to be an account in the body is still refused", async () => {
    const before = await t.counts();
    const res = await t.call("POST", "/api/rooms", t.guest("Faux_Compte"), { role: "player", kind: "account", playerId: 1, hostId: 1 });
    expect(res.status).toBe(403);
    expect(await t.counts()).toEqual(before);
  });

  test("a guest sending the same creation twice gets two refusals and no room", async () => {
    const before = await t.counts();
    const cookie = t.guest("Double_Clic");
    const replies = await Promise.all([t.call("POST", "/api/rooms", cookie, { role: "player" }), t.call("POST", "/api/rooms", cookie, { role: "player" })]);
    expect(replies.map((r) => r.status)).toEqual([403, 403]);
    expect(await t.counts()).toEqual(before);
  });

  test("/room?code=<missing> lets the guest in only to join, and the server finds no room (404)", async () => {
    const cookie = t.guest("Visiteur_Code");
    const query = new URLSearchParams({ code: MISSING });
    expect(await roomEntry(new Headers({ cookie }), t.auth, query, SECRET)).toEqual({ player: "Visiteur_Code", guest: true });
    // ce que la page demande en arrivant : rejoindre, jamais créer
    const arrival = arrivalOf(`?${query}`, "room", true);
    expect(arrival).toEqual({ action: "join", via: { code: MISSING } });
    const before = await t.counts();
    const res = await t.call("POST", "/api/rooms/join", cookie, { code: MISSING });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect(await t.counts()).toEqual(before);
  });

  test("a guest joining the same missing code twice at once gets two 404 and no room", async () => {
    const before = await t.counts();
    const cookie = t.guest("Double_Code");
    const replies = await Promise.all([t.call("POST", "/api/rooms/join", cookie, { code: MISSING }), t.call("POST", "/api/rooms/join", cookie, { code: MISSING })]);
    expect(replies.map((r) => r.status)).toEqual([404, 404]);
    expect(await t.counts()).toEqual(before);
  });

  test("acting on a missing code as host (settings, launch, invites) does not open it", async () => {
    const before = await t.counts();
    const cookie = t.guest("Faux_Hote");
    expect((await t.call("PATCH", `/api/rooms/${MISSING}`, cookie, { role: "player" })).status).toBe(404);
    expect((await t.call("POST", `/api/rooms/${MISSING}/launch`, cookie)).status).toBe(404);
    expect((await t.call("POST", `/api/rooms/${MISSING}/invites`, cookie)).status).toBe(404);
    expect((await t.call("GET", `/api/rooms/${MISSING}`, cookie)).status).toBe(404);
    expect(await t.counts()).toEqual(before);
  });

  test("a real-time join (room page, follow) on a missing code is refused and opens nothing", async () => {
    const before = await t.counts();
    expect(await realtimeJoin(t, t.guest("Nageur_Fantome"), MISSING, true)).toEqual({ type: "error", code: "not_member" });
    expect(await t.counts()).toEqual(before);
  });

  test("a plain real-time join (race page) on a missing code gets no presence channel", async () => {
    const before = await t.counts();
    // refusé avant d'entrer : aucune présence n'est diffusée pour ce code
    expect(await realtimeJoin(t, t.guest("Nageur_Course"), MISSING, false)).toEqual({ type: "error", code: "not_member" });
    expect(await t.counts()).toEqual(before);
  });
});
