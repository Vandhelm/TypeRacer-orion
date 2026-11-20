import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { rooms } from "../../db/schema";
import { roomsFixture } from "./rooms.fixture";

type Fixture = Awaited<ReturnType<typeof roomsFixture>>;

const statusOf = async (t: Fixture, code: string) => (await t.db.select({ status: rooms.status }).from(rooms).where(eq(rooms.code, code)))[0]!.status;
const launch = (t: Fixture, code: string, cookie: string) => t.call("POST", `/api/rooms/${code}/launch`, cookie);

describe("COURSE-02 — the server launches only with at least 2 participants, at least 1 human; bots count, spectators do not", () => {
  let t: Fixture;
  beforeAll(async () => {
    t = await roomsFixture();
  });

  test("1 human alone (no bots) is refused with 409 not_enough_players, and the room keeps waiting", async () => {
    const { room, host } = await t.open("Course2_Seul", { bots: false });
    const res = await launch(t, room.code, host.cookie);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "not_enough_players" });
    expect(await statusOf(t, room.code)).toBe("waiting");
  });

  test("1 human + 1 bot (2 seats, bots on) is accepted", async () => {
    const { room, host } = await t.open("Course2_Bot", { bots: true, guests: 2 });
    expect((await launch(t, room.code, host.cookie)).status).toBe(200);
    expect(await statusOf(t, room.code)).toBe("racing");
  });

  test("2 humans without bots are accepted", async () => {
    const { room, host } = await t.open("Course2_Deux", { bots: false });
    const guestJoin = await t.join(t.guest("Course2_Invite"), { code: room.code });
    expect(guestJoin.status).toBe(200);
    expect((await launch(t, room.code, host.cookie)).status).toBe(200);
  });

  test("1 human + spectators (no bots) is refused: spectators do not count", async () => {
    const { room, host } = await t.open("Course2_Specs", { bots: false });
    for (const name of ["Course2_Sp1", "Course2_Sp2", "Course2_Sp3"]) {
      expect((await t.join(t.guest(name), { code: room.code, role: "spectator" })).status).toBe(200);
    }
    const res = await launch(t, room.code, host.cookie);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "not_enough_players" });
    expect(await statusOf(t, room.code)).toBe("waiting");
  });

  test("0 human player + bots (the host watches) is refused", async () => {
    const { room, host } = await t.open("Course2_Regard", { bots: true, guests: 4 }, "spectator");
    const res = await launch(t, room.code, host.cookie);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "not_enough_players" });
    expect(await statusOf(t, room.code)).toBe("waiting");
  });

  test("the host switching to spectator after setting up the room can no longer launch with bots alone", async () => {
    const { room, host } = await t.open("Course2_Bascule", { bots: true, guests: 4 });
    expect((await t.call("PATCH", `/api/rooms/${room.code}`, host.cookie, { role: "spectator" })).status).toBe(200);
    expect((await launch(t, room.code, host.cookie)).status).toBe(409);
  });

  test("a spectator host with 1 human player and bots can launch (the human races)", async () => {
    const { room, host } = await t.open("Course2_HoteSp", { bots: true, guests: 3 }, "spectator");
    expect((await t.join(t.guest("Course2_Coureur"), { code: room.code })).status).toBe(200);
    expect((await launch(t, room.code, host.cookie)).status).toBe(200);
  });

  test("turning bots off just before launching is seen by the server (1 human left: refused)", async () => {
    const { room, host } = await t.open("Course2_SansBot", { bots: true, guests: 4 });
    expect((await t.call("PATCH", `/api/rooms/${room.code}`, host.cookie, { settings: { bots: false } })).status).toBe(200);
    expect((await launch(t, room.code, host.cookie)).status).toBe(409);
  });

  test("a body claiming extra players changes nothing (the server counts members itself)", async () => {
    const { room, host } = await t.open("Course2_Corps", { bots: false });
    const res = await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie, { players: 5, bots: true });
    expect(res.status).not.toBe(200);
    expect(await statusOf(t, room.code)).toBe("waiting");
  });
});
