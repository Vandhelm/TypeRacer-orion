import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { players, raceConfigs, roomMembers, rooms, user } from "../../db/schema";
import { DEFAULT_CONFIG } from "../../db/mocks/data";
import { createMockDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { isRoomCode, newInviteToken } from "../rooms/access";
import { createAuth } from "./auth";
import { GUEST_COOKIE, signGuest } from "./guest";
import { DEFAULT_SETTINGS } from "../rooms/settings";
import { CodeExhausted, createRoom, leaveAfterDisconnect, raceDeadlineMs, withFreshCode } from "./rooms";
import { handleRoomsApi } from "./rooms-api";

// SALLE-09 : l'échéance suit la durée de la course (race_configs.duration) ; les salons de ces tests gardent la durée par défaut
const RACE_MAX_MS = raceDeadlineMs(DEFAULT_SETTINGS.duration);

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
const SECRET = "guest-secret-guest-secret-guest-secret";

type TestDb = Awaited<ReturnType<typeof createMockDatabase>>;

/** Une ligne de salon minimale, pour forcer une collision de code. */
async function insertRoom(db: TestDb, code: string) {
  const [host] = await db.select({ id: players.id }).from(players).where(eq(players.name, "Maki_77"));
  const [config] = await db.insert(raceConfigs).values(DEFAULT_CONFIG).returning({ id: raceConfigs.id });
  const [row] = await db
    .insert(rooms)
    .values({ code, inviteToken: newInviteToken(), name: "Test", visibility: "public", guests: 4, bots: true, hostId: host!.id, configId: config!.id })
    .returning({ id: rooms.id, code: rooms.code });
  return row!;
}

describe("SALLE-02 — unique room code", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createMockDatabase();
  });

  test("a code already taken is drawn again instead of failing", async () => {
    const draws = ["CRABE7", "NUVEA2"];
    const row = await withFreshCode((code) => insertRoom(db, code), () => draws.shift()!);
    expect(row.code).toBe("NUVEA2");
    expect(draws).toHaveLength(0);
  });

  test("gives up with CodeExhausted after too many collisions, never a raw database error", async () => {
    await expect(withFreshCode((code) => insertRoom(db, code), () => "CRABE7", 3)).rejects.toBeInstanceOf(CodeExhausted);
  });

  test("other database errors are not swallowed", async () => {
    await expect(withFreshCode(() => insertRoom(db, "bad-code"))).rejects.not.toBeInstanceOf(CodeExhausted);
  });
});

/** Une base, son auth, et de quoi ouvrir une session de compte ou d'invité. */
async function setup() {
  const db = await createMockDatabase();
  const auth = createAuth(db);
  const signUp = async (name: string) => {
    await auth.api.signUpEmail({ body: { name, email: placeholderEmail(name), password: "sushi-roll-42", username: name, displayUsername: name } });
    const { headers } = await auth.api.signInUsername({ body: { username: name, password: "sushi-roll-42" }, returnHeaders: true });
    const [account] = await db.select({ playerId: user.playerId }).from(user).where(eq(user.displayUsername, name));
    return { cookie: headers.get("set-cookie")!.split(";")[0]!, playerId: account!.playerId };
  };
  // un invité garde son cookie : le même pseudo signé une autre fois est une autre session (SALLE-03)
  const sessions = new Map<string, string>();
  const freshGuest = (name: string) => `${GUEST_COOKIE}=${signGuest(name, SECRET)}`;
  const guest = (name: string) => sessions.get(name) ?? sessions.set(name, freshGuest(name)).get(name)!;
  const call = (method: string, path: string, cookie?: string, body?: unknown) =>
    handleRoomsApi(
      new Request(`http://localhost${path}`, {
        method,
        headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
        body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      }),
      db,
      auth,
      SECRET,
    );
  /** SALLE-06 : un compte n'est que dans un salon à la fois ; chaque salon d'un test a donc son propre hôte, neuf. */
  let hosts = 0;
  const newHost = (base: string) => signUp(`${base}_${++hosts}`);
  return { db, auth, signUp, newHost, guest, freshGuest, call };
}

describe("SALLE-01 — a signed-in user creates a room and hosts it", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  beforeAll(async () => {
    t = await setup();
  });

  test("POST /api/rooms without a session is refused with 401", async () => {
    const res = await t.call("POST", "/api/rooms", undefined, { role: "player" });
    expect(res.status).toBe(401);
  });

  test("a guest cannot create a room (403), even with a valid signed nickname", async () => {
    const res = await t.call("POST", "/api/rooms", t.guest("Corail_Invite"), { role: "player" });
    expect(res.status).toBe(403);
  });

  test("a signed-in user gets a code and becomes host_id", async () => {
    const { cookie, playerId } = await t.signUp("Hote_Un");
    const res = await t.call("POST", "/api/rooms", cookie, { role: "player" });
    expect(res.status).toBe(201);
    const { room, you } = (await res.json()) as { room: { code: string; host: string; members: { key: string; role: string; host: boolean }[] }; you: string };
    expect(isRoomCode(room.code)).toBe(true);
    const [row] = await t.db.select().from(rooms).where(eq(rooms.code, room.code));
    expect(row!.hostId).toBe(playerId);
    expect(room.host).toBe(you);
    expect(room.members).toEqual([expect.objectContaining({ key: you, role: "player", host: true })]);
  });

  test("the host who chooses spectator is a member without a seat", async () => {
    const { cookie, playerId } = await t.signUp("Hote_Spectateur");
    const res = await t.call("POST", "/api/rooms", cookie, { role: "spectator" });
    expect(res.status).toBe(201);
    const { room } = (await res.json()) as { room: { code: string; members: { role: string; seat: number | null }[] } };
    expect(room.members).toEqual([expect.objectContaining({ role: "spectator", seat: null })]);
    const [member] = await t.db.select().from(roomMembers).where(eq(roomMembers.playerId, playerId));
    expect(member).toMatchObject({ role: "spectator", seat: null });
  });

  test("the host can switch between player and spectator", async () => {
    const { cookie } = await t.signUp("Hote_Change");
    const created = (await (await t.call("POST", "/api/rooms", cookie, { role: "player" })).json()) as { room: { code: string } };
    const res = await t.call("PATCH", `/api/rooms/${created.room.code}`, cookie, { role: "spectator" });
    expect(res.status).toBe(200);
    const { room } = (await res.json()) as { room: { members: { role: string; seat: number | null }[] } };
    expect(room.members[0]).toMatchObject({ role: "spectator", seat: null });
    const back = (await (await t.call("PATCH", `/api/rooms/${created.room.code}`, cookie, { role: "player" })).json()) as { room: { members: { role: string; seat: number | null }[] } };
    expect(back.room.members[0]).toMatchObject({ role: "player", seat: 0 });
  });

  test("the creation body is validated (TECH-07): unknown role or field is a 400", async () => {
    const { cookie } = await t.signUp("Hote_Invalide");
    expect((await t.call("POST", "/api/rooms", cookie, { role: "admin" })).status).toBe(400);
    expect((await t.call("POST", "/api/rooms", cookie, { role: "player", hostId: 1 })).status).toBe(400);
    expect((await t.call("POST", "/api/rooms", cookie, "{not json")).status).toBe(400);
  });

  test("settings sent at creation are stored; the host id is never read from the body", async () => {
    const { cookie, playerId } = await t.signUp("Hote_Reglages");
    const res = await t.call("POST", "/api/rooms", cookie, { role: "player", settings: { visibility: "public", guests: 6, language: "en", name: "Mon salon", autoName: false } });
    const { room } = (await res.json()) as { room: { code: string; settings: { visibility: string; guests: number; language: string; name: string } } };
    expect(room.settings).toMatchObject({ visibility: "public", guests: 6, language: "en", name: "Mon salon" });
    const [row] = await t.db.select().from(rooms).where(eq(rooms.code, room.code));
    expect(row).toMatchObject({ visibility: "public", guests: 6, hostId: playerId, status: "waiting" });
  });

  test("createRoom tolerates a forced code collision and still returns a fresh code", async () => {
    const { playerId } = await t.signUp("Hote_Collision");
    const draws = ["CRABE7", "FRAKS3"];
    const { room } = await createRoom(t.db, { playerId }, { role: "player" }, () => draws.shift()!);
    expect(room.code).toBe("FRAKS3");
  });
});

type Joined = { room: { code: string; members: { key: string; name: string; role: string; guest: boolean }[]; invite: string | null }; you: string };

describe("SALLE-03 — visibility decides who sees and enters a room", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  let host: { cookie: string; playerId: number };
  const open = async (visibility: "public" | "semi" | "private") => {
    host = await t.newHost("Hote_Visible");
    const res = await t.call("POST", "/api/rooms", host.cookie, { role: "player", settings: { visibility } });
    return ((await res.json()) as Joined).room;
  };
  const inviteOf = async (code: string) => ((await (await t.call("GET", `/api/rooms/${code}`, host.cookie)).json()) as Joined).room.invite!;
  beforeAll(async () => {
    t = await setup();
    host = await t.signUp("Hote_Visible");
  });

  test("GET /api/rooms lists public rooms only, never semi or private", async () => {
    const pub = await open("public");
    const semi = await open("semi");
    const priv = await open("private");
    const res = await t.call("GET", "/api/rooms");
    expect(res.status).toBe(200);
    const { rooms: listed } = (await res.json()) as { rooms: { code: string }[] };
    const codes = listed.map((r) => r.code);
    expect(codes).toContain(pub.code);
    expect(codes).not.toContain(semi.code);
    expect(codes).not.toContain(priv.code);
    const [demoPrivate] = await t.db.select({ code: rooms.code }).from(rooms).where(eq(rooms.visibility, "private"));
    expect(codes).not.toContain(demoPrivate!.code);
  });

  test("the list gives no invitation token", async () => {
    await open("public");
    const body = await (await t.call("GET", "/api/rooms")).text();
    expect(body).not.toContain("invite");
  });

  test("the code of a private room is refused", async () => {
    const priv = await open("private");
    const res = await t.call("POST", "/api/rooms/join", t.guest("Curieux_1"), { code: priv.code });
    expect(res.status).toBe(404);
    const members = await t.db.select().from(roomMembers).where(eq(roomMembers.guestName, "Curieux_1"));
    expect(members).toHaveLength(0);
  });

  test("the code of a semi (on code) room is accepted", async () => {
    const semi = await open("semi");
    const res = await t.call("POST", "/api/rooms/join", t.guest("Codeur_1"), { code: semi.code });
    expect(res.status).toBe(200);
    const { room, you } = (await res.json()) as Joined;
    expect(you).toStartWith("guest:");
    expect(room.members.map((m) => m.key)).toContain(you);
    expect(room.invite).toBeNull();
  });

  test("a public room is entered directly with its code", async () => {
    const pub = await open("public");
    const res = await t.call("POST", "/api/rooms/join", (await t.signUp("Passant_1")).cookie, { code: pub.code });
    expect(res.status).toBe(200);
  });

  test("the invitation link opens every visibility, including private", async () => {
    for (const visibility of ["public", "semi", "private"] as const) {
      const room = await open(visibility);
      const res = await t.call("POST", "/api/rooms/join", t.guest(`Invite_${visibility}`), { invite: await inviteOf(room.code) });
      expect(res.status).toBe(200);
    }
  });

  test("a wrong invitation token is refused", async () => {
    const res = await t.call("POST", "/api/rooms/join", t.guest("Faussaire"), { invite: "0".repeat(32) });
    expect(res.status).toBe(404);
  });

  test("joining needs a session (401) and a valid body (400)", async () => {
    const pub = await open("public");
    expect((await t.call("POST", "/api/rooms/join", undefined, { code: pub.code })).status).toBe(401);
    expect((await t.call("POST", "/api/rooms/join", t.guest("Bavard_1"), { code: pub.code, role: "host" })).status).toBe(400);
    expect((await t.call("POST", "/api/rooms/join", t.guest("Bavard_1"), {})).status).toBe(400);
  });

  test("joining twice does not duplicate the member", async () => {
    const pub = await open("public");
    const first = (await (await t.call("POST", "/api/rooms/join", t.guest("Deux_Fois"), { code: pub.code })).json()) as Joined;
    const res = await t.call("POST", "/api/rooms/join", t.guest("Deux_Fois"), { code: pub.code });
    const { room, you } = (await res.json()) as Joined;
    expect(you).toBe(first.you);
    expect(room.members.filter((m) => m.key === you)).toHaveLength(1);
  });

  test("a member who is not the host cannot change the settings (403)", async () => {
    const pub = await open("public");
    await t.call("POST", "/api/rooms/join", t.guest("Pas_Hote"), { code: pub.code });
    const res = await t.call("PATCH", `/api/rooms/${pub.code}`, t.guest("Pas_Hote"), { settings: { visibility: "private" } });
    expect(res.status).toBe(403);
  });

  test("the host can change the visibility; the list follows", async () => {
    const pub = await open("public");
    await t.call("PATCH", `/api/rooms/${pub.code}`, host.cookie, { settings: { visibility: "private" } });
    const { rooms: listed } = (await (await t.call("GET", "/api/rooms")).json()) as { rooms: { code: string }[] };
    expect(listed.map((r) => r.code)).not.toContain(pub.code);
  });

  test("leaving removes the member", async () => {
    const pub = await open("public");
    const { you } = (await (await t.call("POST", "/api/rooms/join", t.guest("Partant"), { code: pub.code })).json()) as Joined;
    const res = await t.call("POST", `/api/rooms/${pub.code}/leave`, t.guest("Partant"));
    expect(res.status).toBe(200);
    const room = ((await (await t.call("GET", `/api/rooms/${pub.code}`, host.cookie)).json()) as Joined).room;
    expect(room.members.map((m) => m.key)).not.toContain(you);
  });

  test("a guest is their signed session, not their nickname: another cookie named bob cannot act as Bob", async () => {
    const priv = await open("private");
    const bob = (await (await t.call("POST", "/api/rooms/join", t.guest("Bob"), { invite: await inviteOf(priv.code) })).json()) as Joined;
    const impostor = t.freshGuest("bob");
    expect((await t.call("GET", `/api/rooms/${priv.code}`, impostor)).status).toBe(404); // SALLE-10 : comme un code inconnu
    expect(await (await t.call("POST", `/api/rooms/${priv.code}/leave`, impostor)).json()).toEqual({ error: "not_found" });
    const room = ((await (await t.call("GET", `/api/rooms/${priv.code}`, t.guest("Bob"))).json()) as Joined).room;
    expect(room.members.map((m) => m.key)).toContain(bob.you);
  });

  test("the same nickname in another session joins as another member, never as the first one", async () => {
    const pub = await open("public");
    const first = (await (await t.call("POST", "/api/rooms/join", t.guest("Homonyme"), { code: pub.code })).json()) as Joined;
    const second = (await (await t.call("POST", "/api/rooms/join", t.freshGuest("homonyme"), { code: pub.code })).json()) as Joined;
    expect(second.you).not.toBe(first.you);
    expect(second.room.members.map((m) => m.key)).toEqual(expect.arrayContaining([first.you, second.you]));
  });
});

describe("SALLE-09 — a room is joined only while waiting or on the results screen", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  let host: { cookie: string; playerId: number };
  const roomIn = async (status: "waiting" | "racing" | "results" | "closed") => {
    host = await t.newHost("Hote_Etat");
    const { room } = (await (await t.call("POST", "/api/rooms", host.cookie, { role: "player", settings: { visibility: "public" } })).json()) as Joined;
    await t.db.update(rooms).set({ status }).where(eq(rooms.code, room.code));
    return room;
  };
  const inviteOf = async (code: string) => ((await (await t.call("GET", `/api/rooms/${code}`, host.cookie)).json()) as Joined).room.invite!;
  beforeAll(async () => {
    t = await setup();
    host = await t.signUp("Hote_Etat");
  });

  test("joining a racing room by a direct API call is refused (409 in_race)", async () => {
    const room = await roomIn("racing");
    const res = await t.call("POST", "/api/rooms/join", t.guest("Retardataire"), { code: room.code });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "in_race" });
    expect(await t.db.$count(roomMembers, eq(roomMembers.guestName, "Retardataire"))).toBe(0);
  });

  test("an invitation link does not open a racing room either", async () => {
    const room = await roomIn("waiting");
    const invite = await inviteOf(room.code);
    await t.db.update(rooms).set({ status: "racing" }).where(eq(rooms.code, room.code));
    expect((await t.call("POST", "/api/rooms/join", t.guest("Invite_Tard"), { invite })).status).toBe(409);
  });

  test("the demo room already racing refuses newcomers", async () => {
    const res = await t.call("POST", "/api/rooms/join", t.guest("Spectre_1"), { code: "RACE88" });
    expect(res.status).toBe(409);
  });

  test("a waiting room accepts", async () => {
    const room = await roomIn("waiting");
    expect((await t.call("POST", "/api/rooms/join", t.guest("Ponctuel"), { code: room.code })).status).toBe(200);
  });

  test("a room on its results screen accepts", async () => {
    const room = await roomIn("results");
    expect((await t.call("POST", "/api/rooms/join", t.guest("Apres_Course"), { code: room.code })).status).toBe(200);
  });

  test("a closed room refuses like an unknown code (404 not_found, SALLE-10)", async () => {
    const room = await roomIn("closed");
    const res = await t.call("POST", "/api/rooms/join", t.guest("Trop_Tard"), { code: room.code });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect(await t.db.$count(roomMembers, eq(roomMembers.guestName, "Trop_Tard"))).toBe(0);
  });

  test("the host launches the race on the server; a new guest joining by code then gets 409 in_race", async () => {
    const room = await roomIn("waiting");
    const launched = await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie);
    expect(launched.status).toBe(200);
    expect(((await launched.json()) as { room: { status: string } }).room.status).toBe("racing");
    const res = await t.call("POST", "/api/rooms/join", t.guest("Apres_Depart"), { code: room.code });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "in_race" });
    expect(await t.db.$count(roomMembers, eq(roomMembers.guestName, "Apres_Depart"))).toBe(0);
  });

  test("only the host launches: a member gets 403 not_host, a stranger 404 like an unknown code, nobody without a session", async () => {
    const room = await roomIn("waiting");
    await t.call("POST", "/api/rooms/join", t.guest("Impatient"), { code: room.code });
    expect(await (await t.call("POST", `/api/rooms/${room.code}/launch`, t.guest("Impatient"))).json()).toEqual({ error: "not_host" });
    expect((await t.call("POST", `/api/rooms/${room.code}/launch`, t.guest("Impatient"))).status).toBe(403);
    expect((await t.call("POST", `/api/rooms/${room.code}/launch`, (await t.signUp("Etranger_1")).cookie)).status).toBe(404);
    expect((await t.call("POST", `/api/rooms/${room.code}/launch`)).status).toBe(401);
    const [row] = await t.db.select({ status: rooms.status }).from(rooms).where(eq(rooms.code, room.code));
    expect(row!.status).toBe("waiting");
  });

  test("a room already racing or closed is not launched again", async () => {
    expect((await t.call("POST", `/api/rooms/${(await roomIn("racing")).code}/launch`, host.cookie)).status).toBe(409);
    expect((await t.call("POST", `/api/rooms/${(await roomIn("closed")).code}/launch`, host.cookie)).status).toBe(404); // SALLE-10
  });

  test("a room on its results screen can be launched again", async () => {
    expect((await t.call("POST", `/api/rooms/${(await roomIn("results")).code}/launch`, host.cookie)).status).toBe(200);
  });

  test("a member who reconnects during the race finds the room again", async () => {
    const room = await roomIn("waiting");
    const { you } = (await (await t.call("POST", "/api/rooms/join", t.guest("Revenant"), { code: room.code })).json()) as Joined;
    await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie);
    const back = await t.call("POST", "/api/rooms/join", t.guest("Revenant"), { code: room.code });
    expect(back.status).toBe(200);
    expect(((await back.json()) as Joined).you).toBe(you);
    expect((await t.call("POST", "/api/rooms/join", t.freshGuest("revenant"), { code: room.code })).status).toBe(409);
  });
});

describe("SALLE-03 — a member finds their room again by its code, whatever its visibility", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  let host: { cookie: string; playerId: number };
  beforeAll(async () => {
    t = await setup();
  });
  beforeEach(async () => {
    host = await t.newHost("Hote_Retour");
  });

  test("the host of a default (private) room reloads with ?code: 200, same key, one member", async () => {
    const created = (await (await t.call("POST", "/api/rooms", host.cookie, { role: "player" })).json()) as Joined & { room: { settings: { visibility: string } } };
    expect(created.room.settings.visibility).toBe("private");
    const res = await t.call("POST", "/api/rooms/join", host.cookie, { code: created.room.code });
    expect(res.status).toBe(200);
    const { room, you } = (await res.json()) as Joined;
    expect(you).toBe(created.you);
    expect(room.members).toHaveLength(1);
  });

  test("a guest who came by invitation reloads with ?code: 200, no duplicate; a fresh guest gets 404", async () => {
    const created = (await (await t.call("POST", "/api/rooms", host.cookie, { role: "player" })).json()) as Joined;
    const invite = created.room.invite!;
    const first = (await (await t.call("POST", "/api/rooms/join", t.guest("Invite_Recharge"), { invite })).json()) as Joined;
    const res = await t.call("POST", "/api/rooms/join", t.guest("Invite_Recharge"), { code: created.room.code });
    expect(res.status).toBe(200);
    const { room, you } = (await res.json()) as Joined;
    expect(you).toBe(first.you);
    expect(room.members.filter((m) => m.key === you)).toHaveLength(1);
    const stranger = await t.call("POST", "/api/rooms/join", t.freshGuest("Invite_Recharge"), { code: created.room.code });
    expect(stranger.status).toBe(404);
    expect(await stranger.json()).toEqual({ error: "not_found" });
  });

  test("a member who entered a public room by code keeps it after the host makes it private; a newcomer gets 404", async () => {
    const { room: pub } = (await (await t.call("POST", "/api/rooms", host.cookie, { role: "player", settings: { visibility: "public" } })).json()) as Joined;
    const first = (await (await t.call("POST", "/api/rooms/join", t.guest("Membre_Fidele"), { code: pub.code })).json()) as Joined;
    expect((await t.call("PATCH", `/api/rooms/${pub.code}`, host.cookie, { settings: { visibility: "private" } })).status).toBe(200);
    const back = await t.call("POST", "/api/rooms/join", t.guest("Membre_Fidele"), { code: pub.code });
    expect(back.status).toBe(200);
    expect(((await back.json()) as Joined).you).toBe(first.you);
    expect((await t.call("POST", "/api/rooms/join", t.guest("Nouveau_Venu"), { code: pub.code })).status).toBe(404);
    expect(await t.db.$count(roomMembers, eq(roomMembers.guestName, "Nouveau_Venu"))).toBe(0);
  });
  test("a member who left a private room and comes back by its code gets 404", async () => {
    const created = (await (await t.call("POST", "/api/rooms", host.cookie, { role: "player" })).json()) as Joined;
    await t.call("POST", "/api/rooms/join", t.guest("Parti_Prive"), { invite: created.room.invite! });
    expect((await t.call("POST", `/api/rooms/${created.room.code}/leave`, t.guest("Parti_Prive"))).status).toBe(200);
    const back = await t.call("POST", "/api/rooms/join", t.guest("Parti_Prive"), { code: created.room.code });
    expect(back.status).toBe(404);
    expect(await t.db.$count(roomMembers, eq(roomMembers.guestName, "Parti_Prive"))).toBe(0);
  });
});

describe("SALLE-09 — the race ends on the server: racing → results once every human player has finished", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  let host: { cookie: string; playerId: number };
  /** Une salle lancée : l'hôte (participant ou spectateur) et un invité participant. */
  const launched = async (role: "player" | "spectator" = "player") => {
    host = await t.newHost("Hote_Fin");
    const { room } = (await (await t.call("POST", "/api/rooms", host.cookie, { role, settings: { visibility: "public" } })).json()) as Joined;
    const runner = t.freshGuest(`Coureur_${room.code}`);
    await t.call("POST", "/api/rooms/join", runner, { code: room.code });
    expect((await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie)).status).toBe(200);
    return { code: room.code, runner };
  };
  const statusOf = async (code: string) => (await t.db.select({ status: rooms.status }).from(rooms).where(eq(rooms.code, code)))[0]!.status;
  beforeAll(async () => {
    t = await setup();
    host = await t.signUp("Hote_Fin");
  });

  test("one human finishing while another still races keeps the room racing; a newcomer gets 409", async () => {
    const { code, runner } = await launched();
    const res = await t.call("POST", `/api/rooms/${code}/finish`, runner);
    expect(res.status).toBe(200);
    expect(await statusOf(code)).toBe("racing");
    expect((await t.call("POST", "/api/rooms/join", t.freshGuest("Opportuniste"), { code })).status).toBe(409);
  });

  test("a member calling finish right after the launch does not reopen the room", async () => {
    const { code, runner } = await launched();
    await t.call("POST", `/api/rooms/${code}/finish`, runner);
    await t.call("POST", `/api/rooms/${code}/finish`, runner);
    expect(await statusOf(code)).toBe("racing");
  });

  test("when every human player has finished, the room is on results and a newcomer can join (200)", async () => {
    const { code, runner } = await launched();
    await t.call("POST", `/api/rooms/${code}/finish`, runner);
    const res = await t.call("POST", `/api/rooms/${code}/finish`, host.cookie);
    expect(((await res.json()) as { room: { status: string } }).room.status).toBe("results");
    expect(await statusOf(code)).toBe("results");
    expect((await t.call("POST", "/api/rooms/join", t.freshGuest("Arrivant_Resultats"), { code })).status).toBe(200);
  });

  test("a spectating host does not hold the race: the last player finishing ends it", async () => {
    const { code, runner } = await launched("spectator");
    await t.call("POST", `/api/rooms/${code}/finish`, runner);
    expect(await statusOf(code)).toBe("results");
  });

  test("a player leaving mid-race does not hold it either", async () => {
    const { code, runner } = await launched();
    await t.call("POST", `/api/rooms/${code}/finish`, host.cookie);
    expect(await statusOf(code)).toBe("racing");
    await t.call("POST", `/api/rooms/${code}/leave`, runner);
    expect(await statusOf(code)).toBe("results");
  });

  test("a new launch starts with nobody finished", async () => {
    const { code, runner } = await launched();
    await t.call("POST", `/api/rooms/${code}/finish`, runner);
    await t.call("POST", `/api/rooms/${code}/finish`, host.cookie);
    expect((await t.call("POST", `/api/rooms/${code}/launch`, host.cookie)).status).toBe(200);
    await t.call("POST", `/api/rooms/${code}/finish`, runner);
    expect(await statusOf(code)).toBe("racing");
  });

  test("finishing on a waiting room changes nothing", async () => {
    host = await t.newHost("Hote_Fin");
    const { room } = (await (await t.call("POST", "/api/rooms", host.cookie, { role: "player" })).json()) as Joined;
    await t.call("POST", `/api/rooms/${room.code}/finish`, host.cookie);
    expect(await statusOf(room.code)).toBe("waiting");
  });

  test("a stranger cannot end the race, nor anyone without a session (401)", async () => {
    const { code } = await launched();
    expect((await t.call("POST", `/api/rooms/${code}/finish`, t.freshGuest("Saboteur"))).status).toBe(404);
    expect((await t.call("POST", `/api/rooms/${code}/finish`, (await t.signUp("Saboteur_2")).cookie)).status).toBe(404);
    expect((await t.call("POST", `/api/rooms/${code}/finish`)).status).toBe(401);
    expect(await statusOf(code)).toBe("racing");
  });
});

describe("SALLE-09 — a race nobody finishes ends on its own after the maximum duration", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  let host: { cookie: string; playerId: number };
  const statusOf = async (code: string) => (await t.db.select({ status: rooms.status }).from(rooms).where(eq(rooms.code, code)))[0]!.status;
  /** Recule le départ de la course de `ms` : le temps passe sans minuterie. */
  const launchedAgo = (code: string, ms: number) => t.db.update(rooms).set({ launchedAt: sql`now() - ${ms} * interval '1 millisecond'` }).where(eq(rooms.code, code));
  /** A (l'hôte) finit ; B ferme son onglet sans rien déclarer : sa déconnexion ne le retire pas. */
  const abandoned = async () => {
    host = await t.newHost("Hote_Abandon");
    const { room } = (await (await t.call("POST", "/api/rooms", host.cookie, { role: "player", settings: { visibility: "public" } })).json()) as Joined;
    const runner = t.freshGuest(`Fantome_${room.code}`);
    const { you } = (await (await t.call("POST", "/api/rooms/join", runner, { code: room.code })).json()) as Joined;
    expect((await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie)).status).toBe(200);
    await t.call("POST", `/api/rooms/${room.code}/finish`, host.cookie);
    const sessionId = you.slice("guest:".length);
    expect((await leaveAfterDisconnect(t.db, room.code, { kind: "guest", name: "Fantome", sessionId })).left).toBe(false);
    return room.code;
  };
  beforeAll(async () => {
    t = await setup();
  });
  beforeEach(async () => {
    host = await t.newHost("Hote_Abandon");
  });

  test("just before the maximum duration the room still races: a newcomer gets 409", async () => {
    const code = await abandoned();
    await launchedAgo(code, RACE_MAX_MS - 60_000);
    expect((await t.call("POST", "/api/rooms/join", t.freshGuest("Trop_Tot"), { code })).status).toBe(409);
    expect(await statusOf(code)).toBe("racing");
  });

  test("past the maximum duration a newcomer gets 200 and the room is on results", async () => {
    const code = await abandoned();
    await launchedAgo(code, RACE_MAX_MS + 1_000);
    expect((await t.call("POST", "/api/rooms/join", t.freshGuest("Apres_Course"), { code })).status).toBe(200);
    expect(await statusOf(code)).toBe("results");
  });

  test("past the maximum duration the host can launch again", async () => {
    const code = await abandoned();
    await launchedAgo(code, RACE_MAX_MS + 1_000);
    expect((await t.call("POST", `/api/rooms/${code}/launch`, host.cookie)).status).toBe(200);
    expect(await statusOf(code)).toBe("racing");
  });

  test("past the maximum duration a member reading the room sees results, and the explorer lists it as results", async () => {
    const code = await abandoned();
    await launchedAgo(code, RACE_MAX_MS + 1_000);
    const listed = (await (await t.call("GET", "/api/rooms")).json()) as { rooms: { code: string; status: string }[] };
    expect(listed.rooms.find((r) => r.code === code)?.status).toBe("results");
    const read = (await (await t.call("GET", `/api/rooms/${code}`, host.cookie)).json()) as { room: { status: string } };
    expect(read.room.status).toBe("results");
  });

  test("a disconnect long after the last race is a real departure; one right after a launch is not", async () => {
    const { room } = (await (await t.call("POST", "/api/rooms", host.cookie, { role: "player", settings: { visibility: "public" } })).json()) as Joined;
    const cookie = t.freshGuest(`Absent_${room.code}`);
    const { you } = (await (await t.call("POST", "/api/rooms/join", cookie, { code: room.code })).json()) as Joined;
    const who = { kind: "guest" as const, name: "Absent", sessionId: you.slice("guest:".length) };
    await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie);
    await t.call("POST", `/api/rooms/${room.code}/finish`, host.cookie);
    await t.call("POST", `/api/rooms/${room.code}/finish`, cookie);
    expect(await statusOf(room.code)).toBe("results");
    expect((await leaveAfterDisconnect(t.db, room.code, who, 15_000)).left).toBe(false);
    await launchedAgo(room.code, 31_000);
    expect((await leaveAfterDisconnect(t.db, room.code, who, 15_000)).left).toBe(true);
  });

  test("a member who has finished is marked finished in the room view; the others are not", async () => {
    const code = await abandoned();
    const { room, you } = (await (await t.call("GET", `/api/rooms/${code}`, host.cookie)).json()) as { room: { members: { key: string; finished: boolean }[] }; you: string };
    expect(room.members.find((m) => m.key === you)?.finished).toBe(true);
    expect(room.members.filter((m) => m.key !== you).map((m) => m.finished)).toEqual([false]);
  });
});

describe("SALLE-09 — role and settings are frozen during a race", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  let host: { cookie: string; playerId: number };
  beforeAll(async () => {
    t = await setup();
  });
  beforeEach(async () => {
    host = await t.newHost("Hote_Gel");
  });

  test("the spectating host cannot take a seat (409 in_race) and stays seatless", async () => {
    const { room } = (await (await t.call("POST", "/api/rooms", host.cookie, { role: "spectator", settings: { visibility: "public" } })).json()) as Joined;
    await t.call("POST", "/api/rooms/join", t.guest("Joueur_A"), { code: room.code });
    await t.call("POST", "/api/rooms/join", t.guest("Joueur_B"), { code: room.code });
    expect((await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie)).status).toBe(200);
    const res = await t.call("PATCH", `/api/rooms/${room.code}`, host.cookie, { role: "player" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "in_race" });
    const [me] = await t.db.select().from(roomMembers).where(eq(roomMembers.memberKey, `player:${host.playerId}`));
    expect(me!.role).toBe("spectator");
    expect(me!.seat).toBeNull();
  });

  test("a setting cannot change during the race (409 in_race), the config stays", async () => {
    const { room } = (await (await t.call("POST", "/api/rooms", host.cookie, { role: "player", settings: { visibility: "public" } })).json()) as Joined;
    await t.call("POST", "/api/rooms/join", t.guest("Joueur_C"), { code: room.code });
    await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie);
    const [before] = await t.db.select({ configId: rooms.configId, visibility: rooms.visibility }).from(rooms).where(eq(rooms.code, room.code));
    const res = await t.call("PATCH", `/api/rooms/${room.code}`, host.cookie, { settings: { visibility: "private", language: "en" } });
    expect(res.status).toBe(409);
    const [after] = await t.db.select({ configId: rooms.configId, visibility: rooms.visibility }).from(rooms).where(eq(rooms.code, room.code));
    expect(after).toEqual(before!);
  });

  test("on the results screen the host can change settings again", async () => {
    const { room } = (await (await t.call("POST", "/api/rooms", host.cookie, { role: "player" })).json()) as Joined;
    await t.db.update(rooms).set({ status: "results" }).where(eq(rooms.code, room.code));
    expect((await t.call("PATCH", `/api/rooms/${room.code}`, host.cookie, { settings: { language: "en" } })).status).toBe(200);
  });
});

describe("SALLE-10 — a closed room's code answers exactly like an unknown code", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  beforeAll(async () => {
    t = await setup();
  });

  test("same status and body for a closed code and a never-used code", async () => {
    const host = await t.signUp("Hote_Ferme");
    const { room } = (await (await t.call("POST", "/api/rooms", host.cookie, { role: "player", settings: { visibility: "public" } })).json()) as Joined;
    await t.call("POST", `/api/rooms/${room.code}/leave`, host.cookie);
    const [row] = await t.db.select({ status: rooms.status }).from(rooms).where(eq(rooms.code, room.code));
    expect(row!.status).toBe("closed");
    let unknown = "ZZZZZZ";
    while ((await t.db.$count(rooms, eq(rooms.code, unknown))) > 0) unknown = unknown.replace("Z", "Y");
    const closed = await t.call("POST", "/api/rooms/join", t.guest("Curieux_Ferme"), { code: room.code });
    const never = await t.call("POST", "/api/rooms/join", t.guest("Curieux_Ferme"), { code: unknown });
    expect(closed.status).toBe(never.status);
    expect(await closed.json()).toEqual(await never.json());
    expect(never.status).toBe(404);
  });
});

describe("SALLE-10 — no room route tells a closed or foreign room from an unknown code", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  let unknown: string;
  const routes = (code: string) =>
    [
      ["GET", `/api/rooms/${code}`, undefined],
      ["PATCH", `/api/rooms/${code}`, { settings: { language: "en" } }],
      ["POST", `/api/rooms/${code}/launch`, undefined],
      ["POST", `/api/rooms/${code}/finish`, undefined],
      ["POST", `/api/rooms/${code}/leave`, undefined],
    ] as const;
  const answers = async (code: string, cookie: string) => {
    const out: { status: number; body: unknown }[] = [];
    for (const [method, path, body] of routes(code)) {
      const res = await t.call(method, path, cookie, body);
      out.push({ status: res.status, body: await res.json() });
    }
    return out;
  };
  beforeAll(async () => {
    t = await setup();
    unknown = "ZZZZZZ";
    while ((await t.db.$count(rooms, eq(rooms.code, unknown))) > 0) unknown = unknown.replace("Z", "Y");
  });

  test("a closed room answers every route like an unknown code (404 not_found)", async () => {
    const host = await t.signUp("Hote_Clos");
    const { room } = (await (await t.call("POST", "/api/rooms", host.cookie, { role: "player" })).json()) as Joined;
    await t.call("POST", `/api/rooms/${room.code}/leave`, host.cookie);
    const stranger = t.freshGuest("Fouineur");
    const never = await answers(unknown, stranger);
    expect(never.every((a) => a.status === 404)).toBe(true);
    expect(await answers(room.code, stranger)).toEqual(never);
    expect(await answers(room.code, host.cookie)).toEqual(never);
  });

  test("an open private room answers a non-member like an unknown code, and keeps its members", async () => {
    const host = await t.signUp("Hote_Secret");
    const { room } = (await (await t.call("POST", "/api/rooms", host.cookie, { role: "player" })).json()) as Joined;
    const stranger = t.freshGuest("Fouineur_2");
    expect(await answers(room.code, stranger)).toEqual(await answers(unknown, stranger));
    expect(await t.db.$count(roomMembers, eq(roomMembers.roomId, (await t.db.select({ id: rooms.id }).from(rooms).where(eq(rooms.code, room.code)))[0]!.id))).toBe(1);
    const [row] = await t.db.select({ status: rooms.status }).from(rooms).where(eq(rooms.code, room.code));
    expect(row!.status).toBe("waiting");
  });
});
