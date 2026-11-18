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
