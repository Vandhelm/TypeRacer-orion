import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { players, raceConfigs, roomMembers, rooms, user } from "../../db/schema";
import { DEFAULT_CONFIG } from "../../db/mocks/data";
import { createMockDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { isRoomCode, newInviteToken } from "../rooms/access";
import { createAuth } from "./auth";
import { GUEST_COOKIE, signGuest } from "./guest";
import { CodeExhausted, createRoom, withFreshCode } from "./rooms";
import { handleRoomsApi } from "./rooms-api";

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
  const guest = (name: string) => `${GUEST_COOKIE}=${signGuest(name, SECRET)}`;
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
  return { db, auth, signUp, guest, call };
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
    expect(you).toBe("guest:codeur_1");
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
    await t.call("POST", "/api/rooms/join", t.guest("Deux_Fois"), { code: pub.code });
    const res = await t.call("POST", "/api/rooms/join", t.guest("Deux_Fois"), { code: pub.code });
    const { room } = (await res.json()) as Joined;
    expect(room.members.filter((m) => m.key === "guest:deux_fois")).toHaveLength(1);
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
    await t.call("POST", "/api/rooms/join", t.guest("Partant"), { code: pub.code });
    const res = await t.call("POST", `/api/rooms/${pub.code}/leave`, t.guest("Partant"));
    expect(res.status).toBe(200);
    const room = ((await (await t.call("GET", `/api/rooms/${pub.code}`, host.cookie)).json()) as Joined).room;
    expect(room.members.map((m) => m.key)).not.toContain("guest:partant");
  });
});
