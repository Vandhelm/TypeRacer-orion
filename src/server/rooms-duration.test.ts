import { beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { raceConfigs, rooms } from "../../db/schema";
import { raceDeadlineMs } from "./rooms";
import { roomsFixture } from "./rooms.fixture";

type Fixture = Awaited<ReturnType<typeof roomsFixture>>;

const configOf = async (t: Fixture, code: string) => {
  const [row] = await t.db.select({ duration: raceConfigs.duration }).from(rooms).innerJoin(raceConfigs, eq(raceConfigs.id, rooms.configId)).where(eq(rooms.code, code));
  return row!;
};

describe("CONF-01 — the server enforces the maximum time: none, or 30 s to 600 s", () => {
  let t: Fixture;
  beforeAll(async () => {
    t = await roomsFixture();
  });

  test("creating a room with a duration out of bounds is refused (400), nothing is created", async () => {
    const host = await t.signUp("Duree_Hors");
    const before = await t.db.$count(rooms);
    for (const duration of [29, 601, 10, 0, "60"]) {
      const res = await t.call("POST", "/api/rooms", host.cookie, { role: "player", settings: { duration } });
      expect(res.status).toBe(400);
    }
    expect(await t.db.$count(rooms)).toBe(before);
  });

  test("the host calling the API directly with 29 s or 601 s gets 400 and the duration is unchanged", async () => {
    const { room, host } = await t.open("Duree_Patch", { duration: 90 });
    for (const duration of [29, 601]) {
      const res = await t.call("PATCH", `/api/rooms/${room.code}`, host.cookie, { settings: { duration } });
      expect(res.status).toBe(400);
    }
    expect((await configOf(t, room.code)).duration).toBe(90);
  });

  test("30 s and 600 s are accepted and stored", async () => {
    const { room, host } = await t.open("Duree_Bornes", { duration: 30 });
    expect((await configOf(t, room.code)).duration).toBe(30);
    expect((await t.call("PATCH", `/api/rooms/${room.code}`, host.cookie, { settings: { duration: 600 } })).status).toBe(200);
    expect((await configOf(t, room.code)).duration).toBe(600);
  });

  test("the host may choose no time limit: stored as null, and read back as null", async () => {
    const { room, host } = await t.open("Duree_Aucune");
    const res = await t.call("PATCH", `/api/rooms/${room.code}`, host.cookie, { settings: { duration: null } });
    expect(res.status).toBe(200);
    expect((await configOf(t, room.code)).duration).toBeNull();
    expect((await t.read(host.cookie, room.code)).body.room.settings.duration).toBeNull();
    expect((await t.call("PATCH", `/api/rooms/${room.code}`, host.cookie, { settings: { duration: 120 } })).status).toBe(200);
    expect((await configOf(t, room.code)).duration).toBe(120);
  });

  test("a race with no time limit does not end on time, even long after the 10-minute deadline", async () => {
    const { room, host } = await t.open("Duree_Sans_Fin", { duration: null });
    await t.join(t.guest("Escargot"), { code: room.code });
    expect((await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie)).status).toBe(200);
    await t.db.update(rooms).set({ launchedAt: sql`now() - ${raceDeadlineMs(600) * 3} * interval '1 millisecond'` }).where(eq(rooms.code, room.code));
    expect((await t.read(host.cookie, room.code)).body.room.status).toBe("racing");
  });

  test("a non-host cannot change the duration (403)", async () => {
    const { room } = await t.open("Duree_Hote", { duration: 60 });
    const other = await t.signUp("Duree_Autre");
    await t.join(other.cookie, { code: room.code });
    expect((await t.call("PATCH", `/api/rooms/${room.code}`, other.cookie, { settings: { duration: null } })).status).toBe(403);
    expect((await configOf(t, room.code)).duration).toBe(60);
  });
});
