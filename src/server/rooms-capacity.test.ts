import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { roomMembers, rooms } from "../../db/schema";
import { roomsFixture } from "./rooms.fixture";

describe("SALLE-05 — the host sets a capacity of 2 to 30 participants; spectators do not count", () => {
  let t: Awaited<ReturnType<typeof roomsFixture>>;
  beforeAll(async () => {
    t = await roomsFixture();
  });

  test("a capacity of 30 is accepted at creation; 31 and 1 are refused (400)", async () => {
    const { room } = await t.open("Cap_Trente", { guests: 30 });
    expect(room.settings.guests).toBe(30);
    const other = await t.signUp("Cap_Trop");
    expect((await t.call("POST", "/api/rooms", other.cookie, { role: "player", settings: { guests: 31 } })).status).toBe(400);
    expect((await t.call("POST", "/api/rooms", other.cookie, { role: "player", settings: { guests: 1 } })).status).toBe(400);
  });

  test("the host changes the capacity up to 30, never beyond nor below 2", async () => {
    const { room, host } = await t.open("Cap_Change");
    expect((await t.call("PATCH", `/api/rooms/${room.code}`, host.cookie, { settings: { guests: 30 } })).status).toBe(200);
    expect((await t.call("PATCH", `/api/rooms/${room.code}`, host.cookie, { settings: { guests: 31 } })).status).toBe(400);
    expect((await t.call("PATCH", `/api/rooms/${room.code}`, host.cookie, { settings: { guests: 1 } })).status).toBe(400);
    expect((await t.call("PATCH", `/api/rooms/${room.code}`, host.cookie, { settings: { guests: "30" } })).status).toBe(400);
  });

  test("30 participants fill the room: the 31st participant is refused (409 full), a spectator still enters", async () => {
    const { room } = await t.open("Cap_Plein", { guests: 30 });
    for (let i = 1; i < 30; i++) expect((await t.join(t.guest(`Nageur_${i}`), { code: room.code })).status).toBe(200);
    const full = await t.join(t.guest("Nageur_31"), { code: room.code });
    expect(full.status).toBe(409);
    expect(full.body.error).toBe("full");
    const spectator = await t.join(t.guest("Curieux"), { code: room.code, role: "spectator" });
    expect(spectator.status).toBe(200);
    const me = spectator.body.room.members.find((m) => m.key === spectator.body.you);
    expect(me).toMatchObject({ role: "spectator", seat: null });
    const seats = spectator.body.room.members.filter((m) => m.role === "player").map((m) => m.seat);
    expect(new Set(seats).size).toBe(30);
    expect(Math.max(...(seats as number[]))).toBe(29);
  });

  test("the capacity chosen by the host is enforced at entry, not only the number of seat colors", async () => {
    const { room } = await t.open("Cap_Deux", { guests: 2 });
    expect((await t.join(t.guest("Second"), { code: room.code })).status).toBe(200);
    expect((await t.join(t.guest("Troisieme"), { code: room.code })).body.error).toBe("full");
    expect((await t.join(t.guest("Regard"), { code: room.code, role: "spectator" })).status).toBe(200);
  });

  test("spectators never take a seat: a room with many spectators still has its free seats", async () => {
    const { room } = await t.open("Cap_Specta", { guests: 2 }, "spectator");
    for (let i = 0; i < 3; i++) expect((await t.join(t.guest(`Vue_${i}`), { code: room.code, role: "spectator" })).status).toBe(200);
    expect((await t.join(t.guest("Joueur_A"), { code: room.code })).status).toBe(200);
    expect((await t.join(t.guest("Joueur_B"), { code: room.code })).status).toBe(200);
    expect((await t.join(t.guest("Joueur_C"), { code: room.code })).body.error).toBe("full");
  });

  test("the host cannot lower the capacity below the participants already seated (409 full)", async () => {
    const { room, host } = await t.open("Cap_Baisse", { guests: 4 });
    await t.join(t.guest("Assis_1"), { code: room.code });
    await t.join(t.guest("Assis_2"), { code: room.code });
    expect((await t.call("PATCH", `/api/rooms/${room.code}`, host.cookie, { settings: { guests: 2 } })).status).toBe(409);
    expect((await t.call("PATCH", `/api/rooms/${room.code}`, host.cookie, { settings: { guests: 3 } })).status).toBe(200);
  });

  test("a spectating host of a full room cannot take a seat (409 full)", async () => {
    const { room, host } = await t.open("Cap_Hote", { guests: 2 }, "spectator");
    await t.join(t.guest("Place_1"), { code: room.code });
    await t.join(t.guest("Place_2"), { code: room.code });
    expect((await t.call("PATCH", `/api/rooms/${room.code}`, host.cookie, { role: "player" })).status).toBe(409);
  });

  test("the join body is validated: an unknown role is a 400", async () => {
    const { room } = await t.open("Cap_Role");
    expect((await t.join(t.guest("Pirate"), { code: room.code, role: "host" })).status).toBe(400);
    expect((await t.join(t.guest("Pirate"), { code: room.code, role: null })).status).toBe(400);
  });

  test("the database refuses a capacity outside 2..30 and a seat outside 0..29", async () => {
    const { room, host } = await t.open("Cap_Base");
    const fails = (query: PromiseLike<unknown>) => expect(Promise.resolve(query)).rejects.toThrow();
    await fails(t.db.update(rooms).set({ guests: 31 }).where(eq(rooms.code, room.code)));
    await fails(t.db.update(rooms).set({ guests: 1 }).where(eq(rooms.code, room.code)));
    await t.db.update(rooms).set({ guests: 30 }).where(eq(rooms.code, room.code));
    await t.db.update(roomMembers).set({ seat: 29 }).where(eq(roomMembers.memberKey, host.key));
    await fails(t.db.update(roomMembers).set({ seat: 30 }).where(eq(roomMembers.memberKey, host.key)));
  });
});
