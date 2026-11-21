import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { raceConfigs, rooms } from "../../db/schema";
import { DEFAULT_SETTINGS } from "../rooms/settings";
import { roomsFixture, type RoomJson } from "./rooms.fixture";

type Fixture = Awaited<ReturnType<typeof roomsFixture>>;
type BonusSettings = RoomJson["settings"] & { catchUpBonus: boolean };

const storedBonus = async (t: Fixture, code: string) => {
  const [row] = await t.db.select({ bonus: raceConfigs.catchUpBonus }).from(rooms).innerJoin(raceConfigs, eq(raceConfigs.id, rooms.configId)).where(eq(rooms.code, code));
  return row!.bonus;
};
const viewBonus = async (t: Fixture, cookie: string, code: string) => ((await t.read(cookie, code)).body.room.settings as BonusSettings).catchUpBonus;

describe("CONF-09 — catch-up bonuses on or off, set by the host between races", () => {
  let t: Fixture;
  beforeAll(async () => {
    t = await roomsFixture();
  });

  test("bonuses are off by default, in the schema defaults, in the database and in the room view", async () => {
    expect(DEFAULT_SETTINGS.catchUpBonus).toBe(false);
    const { room, host } = await t.open("Bonus_Defaut");
    expect((room.settings as BonusSettings).catchUpBonus).toBe(false);
    expect(await storedBonus(t, room.code)).toBe(false);
    expect(await viewBonus(t, host.cookie, room.code)).toBe(false);
  });

  test("the host can turn bonuses on at creation", async () => {
    const { room } = await t.open("Bonus_Creation", { catchUpBonus: true });
    expect(await storedBonus(t, room.code)).toBe(true);
  });

  test("the host toggles bonuses on then off, and every member reads the stored value back", async () => {
    const { room, host } = await t.open("Bonus_Bascule");
    const member = t.guest("Remontee");
    await t.join(member, { code: room.code });
    expect((await t.call("PATCH", `/api/rooms/${room.code}`, host.cookie, { settings: { catchUpBonus: true } })).status).toBe(200);
    expect(await storedBonus(t, room.code)).toBe(true);
    expect(await viewBonus(t, member, room.code)).toBe(true);
    expect((await t.call("PATCH", `/api/rooms/${room.code}`, host.cookie, { settings: { catchUpBonus: false } })).status).toBe(200);
    expect(await storedBonus(t, room.code)).toBe(false);
    expect(await viewBonus(t, host.cookie, room.code)).toBe(false);
  });

  test("changing another setting keeps the bonus choice", async () => {
    const { room, host } = await t.open("Bonus_Garde", { catchUpBonus: true });
    expect((await t.call("PATCH", `/api/rooms/${room.code}`, host.cookie, { settings: { duration: 90 } })).status).toBe(200);
    expect(await storedBonus(t, room.code)).toBe(true);
  });

  test("a non-host calling the API directly is refused (403) and the value is unchanged", async () => {
    const { room } = await t.open("Bonus_Hote");
    const other = await t.signUp("Bonus_Autre");
    await t.join(other.cookie, { code: room.code });
    const guest = t.guest("Bonus_Invite");
    await t.join(guest, { code: room.code });
    for (const cookie of [other.cookie, guest]) {
      const res = await t.call("PATCH", `/api/rooms/${room.code}`, cookie, { settings: { catchUpBonus: true } });
      expect(res.status).toBe(403);
    }
    expect(await storedBonus(t, room.code)).toBe(false);
  });

  test("the host cannot change bonuses during a race (409), the value is unchanged", async () => {
    const { room, host } = await t.open("Bonus_Course");
    await t.join(t.guest("Bonus_Coureur"), { code: room.code });
    expect((await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie)).status).toBe(200);
    const res = await t.call("PATCH", `/api/rooms/${room.code}`, host.cookie, { settings: { catchUpBonus: true } });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "in_race" });
    expect(await storedBonus(t, room.code)).toBe(false);
  });

  test("a value that is not a boolean is refused (400)", async () => {
    const { room, host } = await t.open("Bonus_Type");
    for (const catchUpBonus of ["true", 1, null, "on"]) {
      const res = await t.call("PATCH", `/api/rooms/${room.code}`, host.cookie, { settings: { catchUpBonus } });
      expect(res.status).toBe(400);
    }
    expect((await t.call("POST", "/api/rooms", (await t.signUp("Bonus_Type2")).cookie, { role: "player", settings: { catchUpBonus: "yes" } })).status).toBe(400);
    expect(await storedBonus(t, room.code)).toBe(false);
  });
});
