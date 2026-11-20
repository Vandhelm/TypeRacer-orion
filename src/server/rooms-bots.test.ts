import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { rooms } from "../../db/schema";
import type { RoomBot } from "../rooms/bots";
import { roomsFixture } from "./rooms.fixture";

type Fixture = Awaited<ReturnType<typeof roomsFixture>>;
type BotsJson = { room: { status: string; settings: { bots: boolean; botList: RoomBot[] } } };

const patch = (t: Fixture, code: string, cookie: string, settings: Record<string, unknown>) => t.call("PATCH", `/api/rooms/${code}`, cookie, { settings });
const storedList = async (t: Fixture, code: string) => (await t.db.select({ bots: rooms.bots, botList: rooms.botList }).from(rooms).where(eq(rooms.code, code)))[0]!;

describe("CONF-10 — the host adds and removes bots one by one, each with its level", () => {
  let t: Fixture;
  beforeAll(async () => {
    t = await roomsFixture();
  });

  test("adding a bot, then a second one at another level, is stored by the server", async () => {
    const { room, host } = await t.open("Conf10_Ajout", { bots: false, guests: 4 });
    let res = await patch(t, room.code, host.cookie, { botList: [{ name: "Wasabi99", level: "beginner" }] });
    expect(res.status).toBe(200);
    res = await patch(t, room.code, host.cookie, { botList: [{ name: "Wasabi99", level: "beginner" }, { name: "Ebi_Fry", level: "expert" }] });
    expect(res.status).toBe(200);
    expect(((await res.json()) as BotsJson).room.settings.botList).toEqual([{ name: "Wasabi99", level: "beginner" }, { name: "Ebi_Fry", level: "expert" }]);
    expect(await storedList(t, room.code)).toEqual({ bots: true, botList: [{ name: "Wasabi99", level: "beginner" }, { name: "Ebi_Fry", level: "expert" }] });
  });

  test("removing a bot keeps the others with their level; removing the last one turns bots off", async () => {
    const { room, host } = await t.open("Conf10_Retrait", { bots: false, guests: 4 });
    await patch(t, room.code, host.cookie, { botList: [{ name: "Wasabi99", level: "beginner" }, { name: "Ebi_Fry", level: "expert" }] });
    expect((await patch(t, room.code, host.cookie, { botList: [{ name: "Ebi_Fry", level: "expert" }] })).status).toBe(200);
    expect(await storedList(t, room.code)).toEqual({ bots: true, botList: [{ name: "Ebi_Fry", level: "expert" }] });
    expect((await patch(t, room.code, host.cookie, { botList: [] })).status).toBe(200);
    expect(await storedList(t, room.code)).toEqual({ bots: false, botList: [] });
  });

  test("changing the level of one bot leaves the other one as it was", async () => {
    const { room, host } = await t.open("Conf10_Niveau", { bots: false, guests: 3 });
    await patch(t, room.code, host.cookie, { botList: [{ name: "Uni_Kun", level: "intermediate" }, { name: "Tako_San", level: "intermediate" }] });
    expect((await patch(t, room.code, host.cookie, { botList: [{ name: "Uni_Kun", level: "expert" }, { name: "Tako_San", level: "intermediate" }] })).status).toBe(200);
    expect((await storedList(t, room.code)).botList).toEqual([{ name: "Uni_Kun", level: "expert" }, { name: "Tako_San", level: "intermediate" }]);
  });

  test("a bot beyond the capacity is refused (409 full) and the list does not change", async () => {
    const { room, host } = await t.open("Conf10_Plein", { bots: false, guests: 3 });
    const two: RoomBot[] = [{ name: "Wasabi99", level: "beginner" }, { name: "Ebi_Fry", level: "expert" }];
    expect((await patch(t, room.code, host.cookie, { botList: two })).status).toBe(200);
    const res = await patch(t, room.code, host.cookie, { botList: [...two, { name: "Uni_Kun", level: "intermediate" }] });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "full" });
    expect((await storedList(t, room.code)).botList).toEqual(two);
  });

  test("a human who joins counts against the capacity: the host cannot add a bot into his seat", async () => {
    const { room, host } = await t.open("Conf10_Humain", { bots: false, guests: 3 });
    expect((await t.join(t.guest("Conf10_Invite"), { code: room.code })).status).toBe(200);
    expect((await patch(t, room.code, host.cookie, { botList: [{ name: "Wasabi99", level: "beginner" }] })).status).toBe(200);
    expect((await patch(t, room.code, host.cookie, { botList: [{ name: "Wasabi99", level: "beginner" }, { name: "Ebi_Fry", level: "beginner" }] })).status).toBe(409);
  });

  test("a member who is not the host cannot change the bots (403), even by calling the API directly", async () => {
    const { room, host } = await t.open("Conf10_Pas_Hote", { bots: false, guests: 4 });
    const guest = t.guest("Conf10_Curieux");
    await t.join(guest, { code: room.code });
    const res = await patch(t, room.code, guest, { botList: [{ name: "Wasabi99", level: "expert" }] });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "not_host" });
    expect(await storedList(t, room.code)).toEqual({ bots: false, botList: [] });
    expect(host.key).toBeTruthy();
  });

  test("the bots cannot change during a race (409 in_race)", async () => {
    const { room, host } = await t.open("Conf10_Course", { bots: false, guests: 3 });
    await patch(t, room.code, host.cookie, { botList: [{ name: "Wasabi99", level: "beginner" }] });
    expect((await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie)).status).toBe(200);
    const res = await patch(t, room.code, host.cookie, { botList: [{ name: "Wasabi99", level: "beginner" }, { name: "Ebi_Fry", level: "expert" }] });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "in_race" });
    expect((await storedList(t, room.code)).botList).toEqual([{ name: "Wasabi99", level: "beginner" }]);
  });

  test("a member reads the same list, with each level", async () => {
    const { room, host } = await t.open("Conf10_Lecture", { bots: false, guests: 4 });
    const guest = t.guest("Conf10_Lecteur");
    await t.join(guest, { code: room.code });
    await patch(t, room.code, host.cookie, { botList: [{ name: "Saba_Sensei", level: "expert" }, { name: "Nori_Ninja", level: "beginner" }] });
    const { status, body } = await t.read(guest, room.code);
    expect(status).toBe(200);
    expect((body as unknown as BotsJson).room.settings.botList).toEqual([{ name: "Saba_Sensei", level: "expert" }, { name: "Nori_Ninja", level: "beginner" }]);
  });

  test("an invalid list is refused (400): unknown name, unknown level, duplicate, extra field, wrong type", async () => {
    const { room, host } = await t.open("Conf10_Invalide", { bots: false, guests: 4 });
    for (const botList of [[{ name: "Conf10_Invalide", level: "beginner" }], [{ name: "Wasabi99", level: "turbo" }], [{ name: "Wasabi99", level: "beginner" }, { name: "Wasabi99", level: "expert" }], [{ name: "Wasabi99", level: "beginner", bot: true }], null, "Wasabi99", [{ name: 7, level: "beginner" }]]) {
      expect((await patch(t, room.code, host.cookie, { botList })).status).toBe(400);
    }
    expect(await storedList(t, room.code)).toEqual({ bots: false, botList: [] });
  });

  test("the old setting still works: a room created with bots on gets one bot per free seat, at its speed", async () => {
    const { room } = await t.open("Conf10_Ancien", { bots: true, guests: 3, botSpeed: "fast" });
    expect(await storedList(t, room.code)).toEqual({ bots: true, botList: [{ name: "Thon_Rouge", level: "expert" }, { name: "Wasabi99", level: "expert" }] });
  });

  test("a room created with its own list keeps it, within the capacity", async () => {
    const { room } = await t.open("Conf10_Creation", { guests: 3, botList: [{ name: "Ebi_Fry", level: "beginner" }] });
    expect(await storedList(t, room.code)).toEqual({ bots: true, botList: [{ name: "Ebi_Fry", level: "beginner" }] });
    const host = await t.signUp("Conf10_Trop");
    const res = await t.call("POST", "/api/rooms", host.cookie, { role: "player", settings: { guests: 2, botList: [{ name: "Ebi_Fry", level: "beginner" }, { name: "Uni_Kun", level: "beginner" }] } });
    expect(res.status).toBe(409);
  });
});

describe("CONF-10 — a change of the bots is pushed to the whole room (CONF-12)", () => {
  test("adding a bot announces the room, so every member following it gets the new list", async () => {
    const announced: string[] = [];
    const t = await roomsFixture((code) => void announced.push(code));
    const { room, host } = await t.open("Conf10_Annonce", { bots: false, guests: 4 });
    announced.length = 0;
    expect((await patch(t, room.code, host.cookie, { botList: [{ name: "Nori_Ninja", level: "expert" }] })).status).toBe(200);
    expect(announced).toEqual([room.code]);
  });
});
