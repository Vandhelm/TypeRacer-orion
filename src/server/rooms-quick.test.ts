import { beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { eq, inArray, sql } from "drizzle-orm";
import { roomBans, roomMembers, rooms } from "../../db/schema";
import { handleGuest } from "./guest";
import { roomsFixture, SECRET, type Joined, type Refused } from "./rooms.fixture";

setDefaultTimeout(30_000); // un compte neuf (mot de passe haché) par salon

type Fixture = Awaited<ReturnType<typeof roomsFixture>>;
type Quick = Joined & Refused & { canCreate?: boolean };

/** Avant chaque test, les salons déjà ouverts (démo, tests précédents) sont fermés : seuls comptent ceux que le test ouvre. */
const closeAll = (t: Fixture) => t.db.update(rooms).set({ status: "closed" });

let names = 0;
/** Un salon public de `guests` places, dont `seated` sont prises (l'hôte compris). */
async function openWith(t: Fixture, guests: number, seated: number, settings: Record<string, unknown> = {}) {
  const opened = await t.open(`Hote_Rapide_${++names}`, { guests, ...settings });
  for (let i = 1; i < seated; i++) {
    const res = await t.join(t.guest(`Convive_${names}_${i}`), { code: opened.room.code });
    if (res.status !== 200) throw new Error(`join failed: ${res.status}`);
  }
  return opened;
}

const quick = async (t: Fixture, cookie: string | undefined, body: unknown = {}) => {
  const res = await t.call("POST", "/api/rooms/quick", cookie, body);
  return { status: res.status, body: (await res.json()) as Quick };
};

/** Date de création forcée, pour l'égalité (la plus ancienne l'emporte). */
const createdAt = (t: Fixture, code: string, iso: string) => t.db.update(rooms).set({ createdAt: sql`${iso}::timestamptz` }).where(eq(rooms.code, code));

describe("JOIN-03 — quick race picks the public room closest to its capacity", () => {
  let t: Fixture;
  beforeAll(async () => {
    t = await roomsFixture();
  });
  beforeEach(async () => {
    await closeAll(t);
  });

  test("the room with the fewest free seats wins, and the player is seated in it", async () => {
    await openWith(t, 6, 1); // 5 places libres
    const close = await openWith(t, 3, 2); // 1 place libre
    await openWith(t, 4, 2); // 2 places libres
    const res = await quick(t, t.guest("Presse_1"));
    expect(res.status).toBe(200);
    expect(res.body.room.code).toBe(close.room.code);
    const [member] = await t.db.select({ role: roomMembers.role, seat: roomMembers.seat }).from(roomMembers).where(eq(roomMembers.memberKey, res.body.you));
    expect(member?.role).toBe("player");
    expect(member?.seat).not.toBeNull();
  });

  test("on a tie, the oldest room wins", async () => {
    const newer = await openWith(t, 4, 2);
    const older = await openWith(t, 4, 2);
    await createdAt(t, newer.room.code, "2026-01-02T00:00:00Z");
    await createdAt(t, older.room.code, "2026-01-01T00:00:00Z");
    const res = await quick(t, t.guest("Egalite_1"));
    expect(res.body.room.code).toBe(older.room.code);
  });

  test("a full room is skipped, even when it is the oldest", async () => {
    const full = await openWith(t, 2, 2);
    await createdAt(t, full.room.code, "2025-01-01T00:00:00Z");
    const open = await openWith(t, 5, 1);
    const res = await quick(t, t.guest("Plein_1"));
    expect(res.body.room.code).toBe(open.room.code);
    expect(await t.db.$count(roomMembers, eq(roomMembers.memberKey, res.body.you))).toBe(1);
  });

  test("a room in a race is skipped; a room on its results screen is joinable", async () => {
    const racing = await openWith(t, 3, 2);
    expect((await t.call("POST", `/api/rooms/${racing.room.code}/launch`, racing.host.cookie)).status).toBe(200);
    const results = await openWith(t, 4, 2);
    await t.db.update(rooms).set({ status: "results" }).where(eq(rooms.code, results.room.code));
    const open = await openWith(t, 8, 1);
    const res = await quick(t, t.guest("Course_1"));
    expect(res.body.room.code).toBe(results.room.code);
    expect(res.body.room.code).not.toBe(open.room.code);
  });

  test("private and on-code rooms are never picked, even when closer to capacity", async () => {
    await openWith(t, 3, 2, { visibility: "semi" });
    // privé : plus personne n'y entre par code, il devient privé une fois occupé
    const hidden = await openWith(t, 3, 2);
    await t.db.update(rooms).set({ visibility: "private" }).where(eq(rooms.code, hidden.room.code));
    const open = await openWith(t, 8, 1);
    const res = await quick(t, t.guest("Public_1"));
    expect(res.body.room.code).toBe(open.room.code);
  });

  test("a room the person was kicked from is skipped", async () => {
    const close = await openWith(t, 3, 1);
    const other = await openWith(t, 8, 1);
    const banned = await t.signUp("Expulse_Rapide");
    expect((await t.join(banned.cookie, { code: close.room.code })).status).toBe(200);
    expect((await t.call("POST", `/api/rooms/${close.room.code}/kick`, close.host.cookie, { member: `player:${banned.playerId}` })).status).toBe(200);
    const res = await quick(t, banned.cookie);
    expect(res.body.room.code).toBe(other.room.code);
  });

  test("the last free seat goes to one person only when two ask at once", async () => {
    const last = await openWith(t, 2, 1);
    const [a, b] = await Promise.all([quick(t, t.guest("Double_A")), quick(t, t.guest("Double_B"))]);
    expect([a.status, b.status].sort()).toEqual([200, 404]);
    expect(await t.db.$count(roomMembers, eq(roomMembers.roomId, (await t.db.select({ id: rooms.id }).from(rooms).where(eq(rooms.code, last.room.code)))[0]!.id))).toBe(2);
  });

  test("someone already in a room is refused (409) with that room, and nothing is written", async () => {
    const mine = await openWith(t, 4, 1);
    await openWith(t, 3, 2);
    const res = await quick(t, mine.host.cookie);
    expect(res.status).toBe(409);
    expect(res.body as unknown).toEqual({ error: "already_in_room", room: mine.room.code });
  });
});

describe("JOIN-03 — no room available", () => {
  let t: Fixture;
  beforeAll(async () => {
    t = await roomsFixture();
  });
  beforeEach(async () => {
    await closeAll(t);
  });

  test("an account is told no room is available and is offered to create one", async () => {
    await openWith(t, 2, 2); // pleine
    const before = await t.db.$count(roomMembers);
    const res = await quick(t, (await t.signUp("Seul_Compte")).cookie);
    expect(res.status).toBe(404);
    expect(res.body as unknown).toEqual({ error: "no_room", canCreate: true });
    expect(await t.db.$count(roomMembers)).toBe(before);
  });

  test("a guest is told no room is available, without an offer to create one", async () => {
    const res = await quick(t, t.guest("Seul_Invite"));
    expect(res.status).toBe(404);
    expect(res.body as unknown).toEqual({ error: "no_room", canCreate: false });
  });

  test("the account then creates a public room with the default settings and hosts it", async () => {
    const host = await t.signUp("Nouvel_Hote");
    const res = await t.call("POST", "/api/rooms", host.cookie, { role: "player", settings: { visibility: "public" } });
    expect(res.status).toBe(201);
    const { room, you } = (await res.json()) as Joined;
    expect(room.host).toBe(you);
    expect((await quick(t, t.guest("Suivant_1"))).body.room.code).toBe(room.code);
  });

  test("a guest still cannot create the room by calling the API directly (403)", async () => {
    const res = await t.call("POST", "/api/rooms", t.guest("Invite_Malin"), { role: "player", settings: { visibility: "public" } });
    expect(res.status).toBe(403);
  });
});

describe("JOIN-03 — the quick race route checks its input", () => {
  let t: Fixture;
  beforeAll(async () => {
    t = await roomsFixture();
  });
  beforeEach(async () => {
    await closeAll(t);
  });

  test("without a session it is refused (401)", async () => {
    expect((await quick(t, undefined)).status).toBe(401);
  });

  test("an unknown field, a non-object body or a forced room is refused (400)", async () => {
    const target = await openWith(t, 8, 1);
    const cookie = t.guest("Curieux_1");
    expect((await quick(t, cookie, { code: target.room.code })).status).toBe(400);
    expect((await quick(t, cookie, { role: "spectator" })).status).toBe(400);
    expect((await quick(t, cookie, null)).status).toBe(400);
    expect((await quick(t, cookie, "x")).status).toBe(400);
    expect(await t.db.$count(roomMembers, eq(roomMembers.guestName, "Curieux_1"))).toBe(0);
  });

  test("an empty body is accepted", async () => {
    await openWith(t, 8, 1);
    const res = await t.call("POST", "/api/rooms/quick", t.guest("Sans_Corps"));
    expect(res.status).toBe(200);
  });

  test("GET is not a quick race", async () => {
    expect((await t.call("GET", "/api/rooms/quick", t.guest("Lecteur_1"))).status).toBe(404);
  });
});

describe("JOIN-03 — the search goes past the first candidates", () => {
  let t: Fixture;
  beforeAll(async () => {
    t = await roomsFixture();
  });
  beforeEach(async () => {
    await closeAll(t);
  });

  test("when the 20 best rooms refuse the person, the 21st is joined", async () => {
    const person = await t.signUp("Refuse_Partout");
    const best: string[] = [];
    for (let i = 0; i < 20; i++) best.push((await openWith(t, 2, 1)).room.code); // 1 place libre chacune
    const wide = await openWith(t, 8, 1); // 7 places libres : la dernière du classement
    // SALLE-07 : la personne a été expulsée des 20 meilleures (ligne de room_bans, comme kickMember)
    const ids = await t.db.select({ id: rooms.id }).from(rooms).where(inArray(rooms.code, best));
    await t.db.insert(roomBans).values(ids.map(({ id }) => ({ roomId: id, memberKey: `player:${person.playerId}` })));
    const res = await quick(t, person.cookie);
    expect(res.status).toBe(200);
    expect(res.body.room.code).toBe(wide.room.code);
  });
});

describe("JOIN-02 / JOIN-03 — a fresh guest opens a session, browses and takes a ticket", () => {
  let t: Fixture;
  beforeAll(async () => {
    t = await roomsFixture();
  });
  beforeEach(async () => {
    await closeAll(t);
  });

  test("opening the session seats nobody; the ticket taken is the only room joined", async () => {
    await openWith(t, 3, 2); // plus proche de sa capacité : « Faire une course » l'aurait choisi
    const taken = await openWith(t, 8, 1);
    const body = JSON.stringify({ nickname: "Flaneur_1" });
    const session = await handleGuest(new Request("http://localhost/api/guest", { method: "POST", headers: { "content-type": "application/json" }, body }), { GUEST_SESSION_SECRET: SECRET });
    expect(session.status).toBe(200);
    const cookie = session.headers.get("set-cookie")!.split(";")[0]!;
    expect(await t.db.$count(roomMembers, eq(roomMembers.guestName, "Flaneur_1"))).toBe(0);
    const listed = (await (await t.call("GET", "/api/rooms", cookie)).json()) as { rooms: { code: string }[] };
    expect(listed.rooms.map((r) => r.code)).toContain(taken.room.code);
    const res = await t.join(cookie, { code: taken.room.code });
    expect(res.status).toBe(200);
    expect(res.body.room.code).toBe(taken.room.code);
    expect(await t.db.$count(roomMembers, eq(roomMembers.memberKey, res.body.you))).toBe(1);
  });
});
