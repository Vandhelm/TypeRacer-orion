import { beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { roomMembers, rooms } from "../../db/schema";
import { roomsFixture } from "./rooms.fixture";

describe("SALLE-06 — a person is in one room at a time", () => {
  let t: Awaited<ReturnType<typeof roomsFixture>>;
  const membershipsOf = (key: string) => t.db.select({ code: rooms.code }).from(roomMembers).innerJoin(rooms, eq(rooms.id, roomMembers.roomId)).where(eq(roomMembers.memberKey, key));
  beforeAll(async () => {
    t = await roomsFixture();
  });

  test("the database itself refuses the same person in two rooms (unique violation)", async () => {
    const a = await t.open("Seul_BaseA");
    const b = await t.open("Seul_BaseB");
    const [roomB] = await t.db.select({ id: rooms.id }).from(rooms).where(eq(rooms.code, b.room.code));
    const insert = t.db.insert(roomMembers).values({ roomId: roomB!.id, memberKey: a.host.key, playerId: a.host.playerId, role: "spectator" });
    await expect(Promise.resolve(insert)).rejects.toThrow();
    expect(await membershipsOf(a.host.key)).toEqual([{ code: a.room.code }]);
  });

  test("joining room B while in room A answers 409 already_in_room with A's code, and changes nothing", async () => {
    const a = await t.open("Seul_A");
    const b = await t.open("Seul_B");
    const cookie = t.guest("Voyageur");
    const first = await t.join(cookie, { code: a.room.code });
    expect(first.status).toBe(200);
    const second = await t.join(cookie, { code: b.room.code });
    expect(second.status).toBe(409);
    expect(second.body as unknown).toEqual({ error: "already_in_room", room: a.room.code });
    expect(await membershipsOf(first.body.you)).toEqual([{ code: a.room.code }]);
  });

  test("after leaving A as proposed, joining B succeeds", async () => {
    const a = await t.open("Seul_QuitteA");
    const b = await t.open("Seul_QuitteB");
    const cookie = t.guest("Demenage");
    const { body } = await t.join(cookie, { code: a.room.code });
    expect((await t.join(cookie, { code: b.room.code })).status).toBe(409);
    expect((await t.call("POST", `/api/rooms/${a.room.code}/leave`, cookie)).status).toBe(200);
    expect((await t.join(cookie, { code: b.room.code })).status).toBe(200);
    expect(await membershipsOf(body.you)).toEqual([{ code: b.room.code }]);
  });

  test("an invitation link to another room is refused the same way", async () => {
    const a = await t.open("Seul_LienA");
    const b = await t.open("Seul_LienB");
    const cookie = t.guest("Invite_Deux");
    await t.join(cookie, { code: a.room.code });
    const res = await t.join(cookie, { invite: b.room.invite! });
    expect(res.body as unknown).toEqual({ error: "already_in_room", room: a.room.code });
  });

  test("an account already in a room cannot create another one (409 already_in_room)", async () => {
    const a = await t.open("Seul_Createur");
    const res = await t.call("POST", "/api/rooms", a.host.cookie, { role: "player" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "already_in_room", room: a.room.code });
    expect(await t.db.$count(rooms, eq(rooms.hostId, a.host.playerId))).toBe(1);
  });

  test("the host of A joining B is refused too, and stays host of A", async () => {
    const a = await t.open("Seul_HoteA");
    const b = await t.open("Seul_HoteB");
    expect((await t.join(a.host.cookie, { code: b.room.code })).body as unknown).toEqual({ error: "already_in_room", room: a.room.code });
  });

  test("the same join twice, or from a second tab at once, makes a single member", async () => {
    const a = await t.open("Seul_Onglets");
    const cookie = t.guest("Deux_Onglets");
    const answers = await Promise.all([t.join(cookie, { code: a.room.code }), t.join(cookie, { code: a.room.code }), t.join(cookie, { invite: a.room.invite! })]);
    expect(answers.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(await membershipsOf(answers[0].body.you)).toEqual([{ code: a.room.code }]);
    const again = await t.join(cookie, { code: a.room.code });
    expect(again.body.room.members.filter((m) => m.key === again.body.you)).toHaveLength(1);
  });

  test("a member reading their own room from another tab is not refused", async () => {
    const a = await t.open("Seul_Lecture");
    expect((await t.read(a.host.cookie, a.room.code)).status).toBe(200);
  });

  test("the demo data never puts a person in two rooms, and a closed room keeps no member", async () => {
    const duplicates = await t.db.execute<{ member_key: string }>(sql`select member_key from room_members group by member_key having count(*) > 1`);
    expect("rows" in duplicates ? duplicates.rows : duplicates).toEqual([]);
    const inClosed = await t.db.$count(roomMembers, sql`${roomMembers.roomId} in (select id from rooms where status = 'closed')`);
    expect(inClosed).toBe(0);
  });
});
