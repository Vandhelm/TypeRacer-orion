import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { roomBans, roomMembers, rooms } from "../../db/schema";
import { roomsFixture } from "./rooms.fixture";

describe("SALLE-07 — the host kicks a participant or a spectator, who can no longer join this room", () => {
  let t: Awaited<ReturnType<typeof roomsFixture>>;
  const kick = async (code: string, cookie: string | undefined, body: unknown) => {
    const res = await t.call("POST", `/api/rooms/${code}/kick`, cookie, body);
    return { status: res.status, body: (await res.json()) as { error?: string; room?: { members: { key: string }[] } } };
  };
  const keysOf = async (code: string) => (await t.db.select({ key: roomMembers.memberKey }).from(roomMembers).innerJoin(rooms, eq(rooms.id, roomMembers.roomId)).where(eq(rooms.code, code))).map((m) => m.key);
  beforeAll(async () => {
    t = await roomsFixture();
  });

  test("a member who is not the host cannot kick (403 not_host), and nobody is removed", async () => {
    const { room } = await t.open("Exp_PasHote");
    const a = t.guest("Membre_A");
    const b = t.guest("Membre_B");
    await t.join(a, { code: room.code });
    const { body } = await t.join(b, { code: room.code });
    const res = await kick(room.code, a, { member: body.you });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("not_host");
    expect(await keysOf(room.code)).toContain(body.you);
  });

  test("a stranger or a request without a session cannot kick either", async () => {
    const { room, host } = await t.open("Exp_Etranger");
    expect((await kick(room.code, t.guest("Passant"), { member: host.key })).status).toBe(404);
    expect((await kick(room.code, undefined, { member: host.key })).status).toBe(401);
  });

  test("the host kicks a participant: removed at once, and joining again is refused (403 kicked), by code or by link", async () => {
    const { room, host } = await t.open("Exp_Hote");
    const cookie = t.guest("Turbulent");
    const { body } = await t.join(cookie, { code: room.code });
    const res = await kick(room.code, host.cookie, { member: body.you });
    expect(res.status).toBe(200);
    expect(res.body.room!.members.map((m) => m.key)).not.toContain(body.you);
    expect(await keysOf(room.code)).not.toContain(body.you);
    const again = await t.join(cookie, { code: room.code });
    expect(again.status).toBe(403);
    expect(again.body.error).toBe("kicked");
    expect((await t.join(cookie, { invite: room.invite!, role: "spectator" })).body.error).toBe("kicked");
    expect(await keysOf(room.code)).not.toContain(body.you);
  });

  test("the host kicks a spectator the same way", async () => {
    const { room, host } = await t.open("Exp_Spect");
    const cookie = t.guest("Voyeur");
    const { body } = await t.join(cookie, { code: room.code, role: "spectator" });
    expect((await kick(room.code, host.cookie, { member: body.you })).status).toBe(200);
    expect((await t.join(cookie, { code: room.code, role: "spectator" })).body.error).toBe("kicked");
  });

  test("a kicked account is refused too, and the kick is stored in the database", async () => {
    const { room, host } = await t.open("Exp_Compte");
    const victim = await t.signUp("Exp_Victime");
    const { body } = await t.join(victim.cookie, { code: room.code });
    await kick(room.code, host.cookie, { member: body.you });
    expect((await t.join(victim.cookie, { code: room.code })).body.error).toBe("kicked");
    const [roomRow] = await t.db.select({ id: rooms.id }).from(rooms).where(eq(rooms.code, room.code));
    expect(await t.db.select({ key: roomBans.memberKey }).from(roomBans).where(eq(roomBans.roomId, roomRow!.id))).toEqual([{ key: body.you }]);
  });

  test("the kicked member reading the room gets 403 kicked (their page says so); a kick does not bar other rooms", async () => {
    const { room, host } = await t.open("Exp_Lecture");
    const cookie = t.guest("Banni");
    const { body } = await t.join(cookie, { code: room.code });
    await kick(room.code, host.cookie, { member: body.you });
    const read = await t.read(cookie, room.code);
    expect(read.status).toBe(403);
    expect(read.body.error).toBe("kicked");
    const other = await t.open("Exp_Ailleurs");
    expect((await t.join(cookie, { code: other.room.code })).status).toBe(200);
  });

  test("the host cannot kick themself, nor someone who is not in the room; the body is validated", async () => {
    const { room, host } = await t.open("Exp_Bornes");
    expect((await kick(room.code, host.cookie, { member: host.key })).status).toBe(400);
    expect((await kick(room.code, host.cookie, { member: "guest:00000000-0000-4000-8000-000000000000" })).status).toBe(404);
    for (const bad of [{}, { member: 12 }, { member: null }, { member: "x".repeat(300) }, { member: host.key, extra: true }]) {
      expect((await kick(room.code, host.cookie, bad)).status).toBe(400);
    }
    expect(await keysOf(room.code)).toEqual([host.key]);
  });

  test("kicking the last runner during a race ends it (results), and kicking twice changes nothing", async () => {
    const { room, host } = await t.open("Exp_Course");
    const cookie = t.guest("Coureur_Expulse");
    const { body } = await t.join(cookie, { code: room.code });
    await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie);
    await t.call("POST", `/api/rooms/${room.code}/finish`, host.cookie);
    expect((await kick(room.code, host.cookie, { member: body.you })).status).toBe(200);
    expect((await t.read(host.cookie, room.code)).body.room.status).toBe("results");
    expect((await kick(room.code, host.cookie, { member: body.you })).status).toBe(404);
  });
});
