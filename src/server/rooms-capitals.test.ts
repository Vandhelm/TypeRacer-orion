import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { raceConfigs, rooms } from "../../db/schema";
import { DEFAULT_SETTINGS } from "../rooms/settings";
import { roomsFixture, type RoomJson } from "./rooms.fixture";

type Fixture = Awaited<ReturnType<typeof roomsFixture>>;
type CapitalsSettings = RoomJson["settings"] & { capitals: boolean };

const storedCapitals = async (t: Fixture, code: string) => {
  const [row] = await t.db.select({ value: raceConfigs.capitals }).from(rooms).innerJoin(raceConfigs, eq(raceConfigs.id, rooms.configId)).where(eq(rooms.code, code));
  return row!.value;
};
const viewCapitals = async (t: Fixture, cookie: string, code: string) => ((await t.read(cookie, code)).body.room.settings as CapitalsSettings).capitals;

describe("CONF-06 — capitals on or off, set by the host and stored by the server", () => {
  let t: Fixture;
  beforeAll(async () => {
    t = await roomsFixture();
  });

  test("capitals are on by default, in the schema defaults, in the database and in the room view", async () => {
    expect(DEFAULT_SETTINGS.capitals).toBe(true);
    const { room, host } = await t.open("Caps_Defaut");
    expect((room.settings as CapitalsSettings).capitals).toBe(true);
    expect(await storedCapitals(t, room.code)).toBe(true);
    expect(await viewCapitals(t, host.cookie, room.code)).toBe(true);
  });

  test("the host can turn capitals off at creation", async () => {
    const { room } = await t.open("Caps_Creation", { capitals: false });
    expect(await storedCapitals(t, room.code)).toBe(false);
  });

  test("the host toggles capitals off then on, and every member reads the stored value back", async () => {
    const { room, host } = await t.open("Caps_Bascule");
    const member = t.guest("Majuscule");
    await t.join(member, { code: room.code });
    expect((await t.call("PATCH", `/api/rooms/${room.code}`, host.cookie, { settings: { capitals: false } })).status).toBe(200);
    expect(await storedCapitals(t, room.code)).toBe(false);
    expect(await viewCapitals(t, member, room.code)).toBe(false);
    expect((await t.call("PATCH", `/api/rooms/${room.code}`, host.cookie, { settings: { capitals: true } })).status).toBe(200);
    expect(await storedCapitals(t, room.code)).toBe(true);
    expect(await viewCapitals(t, host.cookie, room.code)).toBe(true);
  });

  test("changing another setting keeps the capitals choice", async () => {
    const { room, host } = await t.open("Caps_Garde", { capitals: false });
    expect((await t.call("PATCH", `/api/rooms/${room.code}`, host.cookie, { settings: { punctuation: true } })).status).toBe(200);
    expect(await storedCapitals(t, room.code)).toBe(false);
  });

  test("a non-host calling the API directly is refused (403) and the value is unchanged", async () => {
    const { room } = await t.open("Caps_Hote");
    const other = await t.signUp("Caps_Autre");
    await t.join(other.cookie, { code: room.code });
    const guest = t.guest("Caps_Invite");
    await t.join(guest, { code: room.code });
    for (const cookie of [other.cookie, guest]) {
      const res = await t.call("PATCH", `/api/rooms/${room.code}`, cookie, { settings: { capitals: false } });
      expect(res.status).toBe(403);
    }
    expect(await storedCapitals(t, room.code)).toBe(true);
  });

  test("the host cannot change capitals during a race (409), the value is unchanged", async () => {
    const { room, host } = await t.open("Caps_Course");
    await t.join(t.guest("Caps_Coureur"), { code: room.code });
    expect((await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie)).status).toBe(200);
    const res = await t.call("PATCH", `/api/rooms/${room.code}`, host.cookie, { settings: { capitals: false } });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "in_race" });
    expect(await storedCapitals(t, room.code)).toBe(true);
  });

  test("a value that is not a boolean is refused (400)", async () => {
    const { room, host } = await t.open("Caps_Type");
    for (const capitals of ["false", 0, null, "off"]) {
      const res = await t.call("PATCH", `/api/rooms/${room.code}`, host.cookie, { settings: { capitals } });
      expect(res.status).toBe(400);
    }
    expect((await t.call("POST", "/api/rooms", (await t.signUp("Caps_Type2")).cookie, { role: "player", settings: { capitals: "no" } })).status).toBe(400);
    expect(await storedCapitals(t, room.code)).toBe(true);
  });
});
