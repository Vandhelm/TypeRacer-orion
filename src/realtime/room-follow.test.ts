// La page salle suit son salon par le serveur temps réel (follow) : membres, expulsion, départ, échéances.
// Les routes HTTP (handleRoomsApi) annoncent leurs changements par un émetteur en mémoire, comme NOTIFY en production.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Server } from "bun";
import { eq, sql } from "drizzle-orm";
import { roomMembers, rooms } from "../../db/schema";
import { createMockDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { createAuth } from "../server/auth";
import { GUEST_COOKIE, signGuest } from "../server/guest";
import { handleRealtimeTicket } from "../server/realtime-ticket";
import { memoryRoomEvents } from "../server/room-events";
import { MEMBER_AWAY_MS, raceDeadlineMs } from "../server/rooms";
import { handleRoomsApi } from "../server/rooms-api";
import { createRoomBackend } from "./room-backend";
import { createRealtimeServer } from "./server";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
const SECRET = "guest-secret-guest-secret-guest-secret";
const TICKET_SECRET = "realtime-secret-realtime-secret-realtime";
const ENV = { GUEST_SESSION_SECRET: SECRET, REALTIME_SECRET: TICKET_SECRET };

type Seen = { type: "room" | "closed" | "not_member"; room?: { code: string; status: string; host: string; members: { key: string }[] } };
type Db = Awaited<ReturnType<typeof createMockDatabase>>;
type Auth = ReturnType<typeof createAuth>;

/** Un serveur temps réel branché sur une base de test, et les routes HTTP des salons qui le préviennent. */
async function harness(options: { leaveAfterMs?: number; refreshMs?: number } = {}) {
  const db = await createMockDatabase();
  const auth = createAuth(db);
  const events = memoryRoomEvents();
  const server = createRealtimeServer({ port: 0, hostname: "127.0.0.1", secret: TICKET_SECRET, rooms: createRoomBackend(db, events), ...options });
  const call = async (method: string, path: string, cookie?: string, body?: unknown) =>
    handleRoomsApi(
      new Request(`http://localhost${path}`, { method, headers: { ...(cookie ? { cookie } : {}), "content-type": "application/json", "x-forwarded-for": "203.0.113.1" }, body: body === undefined ? undefined : JSON.stringify(body) }),
      db,
      auth,
      SECRET,
      events.emit,
      undefined,
      { env: { TRUST_PROXY: "1" } },
    );
  const signUp = async (name: string) => {
    await auth.api.signUpEmail({ body: { name, email: placeholderEmail(name), password: "sushi-roll-42", username: name, displayUsername: name } });
    const { headers } = await auth.api.signInUsername({ body: { username: name, password: "sushi-roll-42" }, returnHeaders: true });
    return headers.get("set-cookie")!.split(";")[0]!;
  };
  return { db, auth, server, call, signUp, follow: (code: string, cookie?: string) => follow(server, auth, code, cookie) };
}

/** Ouvre une connexion comme la page salle (ticket, puis join avec follow) et range ce qu'elle reçoit du salon. */
async function follow(server: Server<unknown>, auth: Auth, code: string, cookie?: string) {
  const grant = await handleRealtimeTicket(new Request("http://localhost/api/realtime/ticket", { method: "POST", headers: cookie ? { cookie } : {} }), auth, ENV);
  if (grant.status !== 200) return null;
  const { ticket } = (await grant.json()) as { ticket: string };
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/?ticket=${encodeURIComponent(ticket)}`);
  const queue: Seen[] = [];
  const waiting: ((m: Seen) => void)[] = [];
  const push = (message: Seen) => {
    const resolve = waiting.shift();
    if (resolve) resolve(message);
    else queue.push(message);
  };
  ws.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as { type: string; code?: string; room?: Seen["room"] };
    if (message.type === "welcome") ws.send(JSON.stringify({ type: "join", room: code, follow: true }));
    else if (message.type === "room") push({ type: "room", room: message.room });
    else if (message.type === "closed") push({ type: "closed" });
    else if (message.type === "error" && message.code === "not_member") push({ type: "not_member" });
  };
  const closed = new Promise<void>((resolve) => (ws.onclose = () => resolve()));
  const next = () => new Promise<Seen>((resolve) => (queue.length ? resolve(queue.shift()!) : waiting.push(resolve)));
  return { next, close: async () => (ws.close(), closed) };
}

const created = async (res: Response) => ((await res.json()) as { room: { code: string } }).room.code;

describe("SALLE-03 — members are pushed in real time to the room page", () => {
  const LEAVE_AFTER_MS = 50;
  let h: Awaited<ReturnType<typeof harness>>;
  let hostCookie: string;
  let code: string;
  let hostTab: NonNullable<Awaited<ReturnType<typeof follow>>>;
  // un invité garde son cookie : le même pseudo signé une autre fois est une autre session (SALLE-03)
  const sessions = new Map<string, string>();
  const freshGuest = (name: string) => `${GUEST_COOKIE}=${signGuest(name, SECRET)}`;
  const guest = (name: string) => sessions.get(name) ?? sessions.set(name, freshGuest(name)).get(name)!;

  beforeAll(async () => {
    h = await harness({ leaveAfterMs: LEAVE_AFTER_MS });
    hostCookie = await h.signUp("Hote_Direct");
    code = await created(await h.call("POST", "/api/rooms", hostCookie, { role: "player", settings: { visibility: "public" } }));
    // l'hôte garde un onglet ouvert pendant toute la suite : fermer la page d'un test ne le fait pas partir
    // (SALLE-08 : sans hôte ni autre compte, le salon fermerait entre deux tests)
    hostTab = (await h.follow(code, hostCookie))!;
    await hostTab.next();
  });
  afterAll(async () => {
    await hostTab.close();
    h.server.stop(true);
  });

  test("a member receives the room, then each new member as they join", async () => {
    const tab = (await h.follow(code, hostCookie))!;
    const first = await tab.next();
    expect(first.type).toBe("room");
    expect(first.room!.members).toHaveLength(1);
    const { you } = (await (await h.call("POST", "/api/rooms/join", guest("Nageur_Live"), { code })).json()) as { you: string };
    const second = await tab.next();
    expect(second.room!.members.map((m) => m.key)).toContain(you);
    await tab.close();
  });

  test("without a session there is no ticket; someone not in the room is refused the room", async () => {
    expect(await h.follow(code)).toBeNull();
    expect((await (await h.follow(code, guest("Intrus_Live")))!.next()).type).toBe("not_member");
  });

  test("closing the last room page of a member makes them leave the room", async () => {
    const { you } = (await (await h.call("POST", "/api/rooms/join", guest("Ephemere"), { code })).json()) as { you: string };
    const host = (await h.follow(code, hostCookie))!;
    await host.next();
    const visitor = (await h.follow(code, guest("Ephemere")))!;
    await visitor.next();
    await visitor.close();
    let seen = await host.next();
    while (seen.room!.members.some((m) => m.key === you)) seen = await host.next();
    expect(seen.room!.members.map((m) => m.key)).not.toContain(you);
    await host.close();
  });

  test("another cookie with the same guest nickname cannot follow a member's room", async () => {
    const invite = ((await (await h.call("POST", `/api/rooms/${code}/invites`, hostCookie)).json()) as { invite: { token: string } }).invite.token; // SALLE-04
    expect((await h.call("POST", "/api/rooms/join", guest("Bob"), { invite })).status).toBe(200);
    expect((await (await h.follow(code, freshGuest("bob")))!.next()).type).toBe("not_member");
    const bob = (await h.follow(code, guest("Bob")))!;
    expect((await bob.next()).type).toBe("room");
    await bob.close();
  });

  test("SALLE-07 — a kicked member stops receiving the room at once; the others see them gone", async () => {
    const host2 = await h.signUp("Hote_Expulse_Live");
    const room = await created(await h.call("POST", "/api/rooms", host2, { role: "player", settings: { visibility: "public" } }));
    const cookie = guest("Expulse_Live");
    const { you } = (await (await h.call("POST", "/api/rooms/join", cookie, { code: room })).json()) as { you: string };
    const host = (await h.follow(room, host2))!;
    const victim = (await h.follow(room, cookie))!;
    await host.next();
    await victim.next();
    expect((await h.call("POST", `/api/rooms/${room}/kick`, host2, { member: you })).status).toBe(200);
    expect((await victim.next()).type).toBe("not_member");
    let seen = await host.next();
    while (seen.room!.members.some((m) => m.key === you)) seen = await host.next();
    expect(seen.room!.members.map((m) => m.key)).not.toContain(you);
    await host.close();
    await victim.close();
  });

  test("SALLE-09 — once launched, closing every room page (going to /game) neither removes members nor closes the room", async () => {
    const host3 = await h.signUp("Hote_Course_Live");
    const racing = await created(await h.call("POST", "/api/rooms", host3, { role: "player", settings: { visibility: "public" } }));
    await h.call("POST", "/api/rooms/join", guest("Coureur_Live"), { code: racing });
    const tabs = [(await h.follow(racing, host3))!, (await h.follow(racing, guest("Coureur_Live")))!];
    await Promise.all(tabs.map((t) => t.next()));
    expect((await h.call("POST", `/api/rooms/${racing}/launch`, host3)).status).toBe(200);
    for (const t of tabs) await t.close();
    await Bun.sleep(LEAVE_AFTER_MS * 4);
    const room = (await (await h.call("GET", `/api/rooms/${racing}`, host3)).json()) as { room: { status: string; members: unknown[] } };
    expect(room.room.status).toBe("racing");
    expect(room.room.members).toHaveLength(2);
  });
});

describe("SALLE-09 — going from the room to the race never costs a member their seat", () => {
  const AWAY_MS = 400;
  let h: Awaited<ReturnType<typeof harness>>;
  let hostCookie: string;
  const runner = `${GUEST_COOKIE}=${signGuest("Sprinteur", SECRET)}`;

  beforeAll(async () => {
    h = await harness({ leaveAfterMs: AWAY_MS });
    hostCookie = await h.signUp("Hote_Sprint");
  });
  afterAll(() => h.server.stop(true));

  test("the room page closes while waiting, the race is launched and finished before the delay: the member stays", async () => {
    const code = await created(await h.call("POST", "/api/rooms", hostCookie, { role: "player" }));
    const invite = ((await (await h.call("POST", `/api/rooms/${code}/invites`, hostCookie)).json()) as { invite: { token: string } }).invite.token; // SALLE-04
    const { you } = (await (await h.call("POST", "/api/rooms/join", runner, { invite })).json()) as { you: string };
    const tab = (await h.follow(code, runner))!;
    await tab.next();
    await tab.close();
    expect((await h.call("POST", `/api/rooms/${code}/launch`, hostCookie)).status).toBe(200);
    await h.call("POST", `/api/rooms/${code}/finish`, hostCookie);
    await h.call("POST", `/api/rooms/${code}/finish`, runner);
    await Bun.sleep(AWAY_MS * 3);
    const room = (await (await h.call("GET", `/api/rooms/${code}`, hostCookie)).json()) as { room: { status: string; members: { key: string }[] } };
    expect(room.room.status).toBe("results");
    expect(room.room.members.map((m) => m.key)).toContain(you);
    // dans une salle privée, « retour au salon » passe par le code : le membre y est toujours
    expect((await h.call("POST", "/api/rooms/join", runner, { code })).status).toBe(200);
  });
});

describe("SALLE-08 / SALLE-09 — what changes with time alone is announced to the room pages", () => {
  let h: Awaited<ReturnType<typeof harness>>;
  let db: Db;

  beforeAll(async () => {
    h = await harness({ refreshMs: 40 });
    db = h.db;
  });
  afterAll(() => h.server.stop(true));

  test("a race past its deadline goes to results on the room pages, with no HTTP request from anyone", async () => {
    const host = await h.signUp("Hote_Echeance");
    const code = await created(await h.call("POST", "/api/rooms", host, { role: "player", settings: { visibility: "public", duration: 10 } }));
    await h.call("POST", "/api/rooms/join", `${GUEST_COOKIE}=${signGuest("Lambin", SECRET)}`, { code });
    await h.call("POST", `/api/rooms/${code}/launch`, host);
    const tab = (await h.follow(code, host))!;
    expect((await tab.next()).room!.status).toBe("racing");
    await db.update(rooms).set({ launchedAt: sql`now() - ${raceDeadlineMs(10) + 1_000} * interval '1 millisecond'` }).where(eq(rooms.code, code));
    let seen = await tab.next();
    while (seen.room!.status === "racing") seen = await tab.next();
    expect(seen.room!.status).toBe("results");
    await tab.close();
  });

  test("a silent host is replaced, and the members' room pages learn the new host", async () => {
    const host = await h.signUp("Hote_Silence");
    const heir = await h.signUp("Heritier");
    const code = await created(await h.call("POST", "/api/rooms", host, { role: "player", settings: { visibility: "public" } }));
    const { you } = (await (await h.call("POST", "/api/rooms/join", heir, { code })).json()) as { you: string };
    const tab = (await h.follow(code, heir))!;
    await tab.next();
    await db.update(roomMembers).set({ lastSeenAt: sql`now() - ${MEMBER_AWAY_MS + 1_000} * interval '1 millisecond'` }).where(sql`${roomMembers.memberKey} <> ${you}`);
    let seen = await tab.next();
    while (seen.room!.host !== you) seen = await tab.next();
    expect(seen.room!.host).toBe(you);
    await tab.close();
  });
});

// SALLE-10 : suivre un salon ne sert pas d'oracle. Les routes HTTP sont couvertes dans rooms.test.ts
// (« no room route tells a closed or foreign room from an unknown code ») ; ici, le suivi en temps réel.
describe("SALLE-10 — following tells neither a foreign nor a closed room from an unknown code", () => {
  let h: Awaited<ReturnType<typeof harness>>;
  let hostCookie = "";
  let hosts = 0;
  let unknown = "ZZZZZZ";
  const stranger = `${GUEST_COOKIE}=${signGuest("Fouineur_Socket", SECRET)}`;

  beforeAll(async () => {
    h = await harness();
    while ((await h.db.$count(rooms, eq(rooms.code, unknown))) > 0) unknown = unknown.replace("Z", "Y");
  }, 20_000);
  afterAll(() => h.server.stop(true));

  const answer = async (code: string, cookie: string) => {
    const tab = (await h.follow(code, cookie))!;
    const seen = await tab.next();
    await tab.close();
    return seen;
  };
  /** Un salon neuf, ouvert par un hôte neuf ; hostCookie devient le sien. */
  const open = async (visibility: "public" | "private") => {
    hostCookie = await h.signUp(`Hote_Socket_${++hosts}`);
    return created(await h.call("POST", "/api/rooms", hostCookie, { role: "player", settings: { visibility } }));
  };

  test("a non-member gets the same answer for an open room and for an unknown code", async () => {
    const never = await answer(unknown, stranger);
    expect(never.type).toBe("not_member");
    for (const visibility of ["public", "private"] as const) expect(await answer(await open(visibility), stranger)).toEqual(never);
  });

  test("a closed room answers like an unknown code, even to its former host", async () => {
    const code = await open("public");
    await h.call("POST", `/api/rooms/${code}/leave`, hostCookie);
    const never = await answer(unknown, stranger);
    expect(await answer(code, stranger)).toEqual(never);
    expect(await answer(code, hostCookie)).toEqual(await answer(unknown, hostCookie));
  });
});

/** Une connexion brute comme la page course : ticket, puis join sans follow ; garde tous les messages reçus. */
async function raw(server: Server<unknown>, auth: Auth, cookie: string) {
  const grant = await handleRealtimeTicket(new Request("http://localhost/api/realtime/ticket", { method: "POST", headers: { cookie } }), auth, ENV);
  const { ticket } = (await grant.json()) as { ticket: string };
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/?ticket=${encodeURIComponent(ticket)}`);
  const seen: { type: string; code?: string; players?: { name: string }[]; playerId?: string }[] = [];
  const welcome = new Promise<void>((resolve) => {
    ws.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as (typeof seen)[number];
      seen.push(message);
      if (message.type === "welcome") resolve();
    };
  });
  await welcome;
  return { ws, seen, send: (message: unknown) => ws.send(JSON.stringify(message)) };
}

describe("SALLE-03 / SALLE-10 / SALLE-09 — only a member joins a room's presence and race", () => {
  let h: Awaited<ReturnType<typeof harness>>;
  let code: string;
  let member: Awaited<ReturnType<typeof raw>>;
  const intruder = `${GUEST_COOKIE}=${signGuest("Intrus_Course", SECRET)}`;

  beforeAll(async () => {
    h = await harness();
    const host = await h.signUp("Hote_Prive");
    code = await created(await h.call("POST", "/api/rooms", host, { role: "player", settings: { visibility: "private" } }));
    member = await raw(h.server, h.auth, host);
    member.send({ type: "join", room: code });
    while (!member.seen.some((m) => m.type === "presence")) await Bun.sleep(10);
  });
  afterAll(() => {
    member.ws.close();
    h.server.stop(true);
  });

  test("a non-member's join of a private room gets not_member, never its presence", async () => {
    const tab = await raw(h.server, h.auth, intruder);
    tab.send({ type: "join", room: code });
    while (!tab.seen.some((m) => m.type === "error")) await Bun.sleep(10);
    expect(tab.seen.find((m) => m.type === "error")?.code).toBe("not_member");
    expect(tab.seen.some((m) => m.type === "presence")).toBe(false);
    // il n'apparaît pas chez les membres, et sa progression n'est ni acceptée ni diffusée
    tab.send({ type: "progress", progress: 0.5, wpm: 60 });
    while (tab.seen.filter((m) => m.type === "error").length < 2) await Bun.sleep(10);
    expect(tab.seen.filter((m) => m.type === "error")[1]?.code).toBe("not_in_room");
    await Bun.sleep(50);
    expect(member.seen.filter((m) => m.type === "presence").every((m) => !m.players?.some((p) => p.name === "Intrus_Course"))).toBe(true);
    expect(member.seen.some((m) => m.type === "progress")).toBe(false);
    tab.ws.close();
  });

  test("an unknown code answers the same as a room one is not in", async () => {
    const tab = await raw(h.server, h.auth, intruder);
    tab.send({ type: "join", room: "ZZZZZZ" });
    while (!tab.seen.some((m) => m.type === "error")) await Bun.sleep(10);
    expect(tab.seen.find((m) => m.type === "error")?.code).toBe("not_member");
    tab.ws.close();
  });
});

describe("SALLE-07 — a kicked member's race socket leaves the room at once", () => {
  let h: Awaited<ReturnType<typeof harness>>;
  beforeAll(async () => {
    h = await harness();
  });
  afterAll(() => h.server.stop(true));

  test("the race socket gets not_member, leaves the presence, and its progress reaches no one", async () => {
    const hostCookie = await h.signUp("Hote_Course_Expulse");
    const code = await created(await h.call("POST", "/api/rooms", hostCookie, { role: "player", settings: { visibility: "public" } }));
    const cookie = `${GUEST_COOKIE}=${signGuest("Expulse_Course", SECRET)}`;
    const { you } = (await (await h.call("POST", "/api/rooms/join", cookie, { code })).json()) as { you: string };
    const host = await raw(h.server, h.auth, hostCookie);
    host.send({ type: "join", room: code });
    const victim = await raw(h.server, h.auth, cookie);
    victim.send({ type: "join", room: code });
    const lists = (name: string) => (m: (typeof host.seen)[number]) => m.type === "presence" && !!m.players?.some((p) => p.name === name);
    while (!host.seen.some(lists("Expulse_Course"))) await Bun.sleep(10);

    expect((await h.call("POST", `/api/rooms/${code}/kick`, hostCookie, { member: you })).status).toBe(200);
    while (!victim.seen.some((m) => m.type === "error")) await Bun.sleep(10);
    expect(victim.seen.find((m) => m.type === "error")?.code).toBe("not_member");
    const last = () => host.seen.filter((m) => m.type === "presence").at(-1);
    while (last()?.players?.some((p) => p.name === "Expulse_Course")) await Bun.sleep(10);

    victim.send({ type: "progress", progress: 0.42, wpm: 60 });
    while (victim.seen.filter((m) => m.type === "error").length < 2) await Bun.sleep(10);
    expect(victim.seen.filter((m) => m.type === "error")[1]?.code).toBe("not_in_room");
    await Bun.sleep(50);
    expect(host.seen.some((m) => m.type === "progress")).toBe(false);
    host.ws.close();
    victim.ws.close();
  });
});
