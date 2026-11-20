import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { roomMembers, rooms } from "../../db/schema";
import { finishAsServer } from "./finish.fixture";
import { roomsFixture } from "./rooms.fixture";

type Fixture = Awaited<ReturnType<typeof roomsFixture>>;

const roomRow = async (t: Fixture, code: string) => (await t.db.select().from(rooms).where(eq(rooms.code, code)))[0]!;
const keysOf = async (t: Fixture, code: string) =>
  (await t.db.select({ key: roomMembers.memberKey }).from(roomMembers).innerJoin(rooms, eq(rooms.id, roomMembers.roomId)).where(eq(rooms.code, code))).map((m) => m.key).sort();

/** Un salon de trois humains (sans bots) dont la première course est finie : il est sur l'écran des résultats. */
async function roomAfterRace(t: Fixture, prefix: string) {
  const { room, host } = await t.open(`${prefix}_Hote`, { bots: false });
  const a = await t.signUp(`${prefix}_A`);
  const b = t.guest(`${prefix}_B`);
  await t.join(a.cookie, { code: room.code });
  await t.join(b, { code: room.code });
  expect((await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie)).status).toBe(200);
  for (const cookie of [host.cookie, a.cookie, b]) await finishAsServer(t.db, t.call, room.code, cookie);
  expect((await roomRow(t, room.code)).status).toBe("results");
  return { code: room.code, host, a, b };
}

describe("COURSE-11 — on the results screen, the host relaunches with the same participants", () => {
  let t: Fixture;
  beforeAll(async () => {
    t = await roomsFixture();
  });

  test("the host relaunches: the room races again with exactly the same members", async () => {
    const { code, host } = await roomAfterRace(t, "C11_Rel");
    const before = await keysOf(t, code);
    expect((await t.call("POST", `/api/rooms/${code}/launch`, host.cookie)).status).toBe(200);
    expect((await roomRow(t, code)).status).toBe("racing");
    expect(await keysOf(t, code)).toEqual(before);
    const { id } = await roomRow(t, code);
    const finished = await t.db.select({ at: roomMembers.finishedAt }).from(roomMembers).where(eq(roomMembers.roomId, id));
    expect(finished.every((m) => m.at === null)).toBe(true);
  });

  test("the host changes the configuration between two races, and the next race uses it", async () => {
    const { code, host, a } = await roomAfterRace(t, "C11_Conf");
    const firstConfig = (await roomRow(t, code)).configId;
    const patched = await t.call("PATCH", `/api/rooms/${code}`, host.cookie, { settings: { language: "en", duration: 120 } });
    expect(patched.status).toBe(200);
    expect((await t.call("POST", `/api/rooms/${code}/launch`, host.cookie)).status).toBe(200);
    const row = await roomRow(t, code);
    expect(row.status).toBe("racing");
    expect(row.configId).not.toBe(firstConfig);
    expect((await t.read(a.cookie, code)).body.room.settings).toMatchObject({ language: "en", duration: 120 });
  });

  test("a non-host cannot relaunch (403) nor change the configuration, and the room stays on its results", async () => {
    const { code, a, b } = await roomAfterRace(t, "C11_NoRel");
    for (const cookie of [a.cookie, b]) {
      const res = await t.call("POST", `/api/rooms/${code}/launch`, cookie);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "not_host" });
    }
    expect((await t.call("PATCH", `/api/rooms/${code}`, a.cookie, { settings: { language: "en" } })).status).toBe(403);
    expect((await roomRow(t, code)).status).toBe("results");
  });
});

describe("COURSE-11 — on the results screen, the host closes the room", () => {
  let t: Fixture;
  const changed: string[] = [];
  beforeAll(async () => {
    t = await roomsFixture((code) => void changed.push(code));
  });

  test("the host closes: the room is closed on the server and every member is out", async () => {
    const { code, host, a, b } = await roomAfterRace(t, "C11_Close");
    const res = await t.call("POST", `/api/rooms/${code}/close`, host.cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ closed: true });
    expect((await roomRow(t, code)).status).toBe("closed");
    expect(await keysOf(t, code)).toEqual([]);
    expect(changed).toContain(code);
    for (const cookie of [host.cookie, a.cookie, b]) expect((await t.read(cookie, code)).status).toBe(404);
    // les membres sont libérés (SALLE-06) : ils peuvent entrer ailleurs
    const other = await t.open("C11_Close_Ailleurs");
    expect((await t.join(a.cookie, { code: other.room.code })).status).toBe(200);
    expect((await t.join(b, { code: other.room.code })).status).toBe(200);
  });

  test("a non-host member calling the API directly is refused (403): nothing changes", async () => {
    const { code, a, b } = await roomAfterRace(t, "C11_NoClose");
    const before = await keysOf(t, code);
    for (const cookie of [a.cookie, b]) {
      const res = await t.call("POST", `/api/rooms/${code}/close`, cookie);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "not_host" });
    }
    expect((await roomRow(t, code)).status).toBe("results");
    expect(await keysOf(t, code)).toEqual(before);
  });

  test("a stranger gets 404 (SALLE-10), and without a session 401", async () => {
    const { code } = await roomAfterRace(t, "C11_Stranger");
    const stranger = await t.signUp("C11_Inconnu");
    expect((await t.call("POST", `/api/rooms/${code}/close`, stranger.cookie)).status).toBe(404);
    expect((await t.call("POST", `/api/rooms/${code}/close`)).status).toBe(401);
    expect((await roomRow(t, code)).status).toBe("results");
  });

  test("an unexpected body is refused (400, TECH-07); an empty object is accepted", async () => {
    const { code, host } = await roomAfterRace(t, "C11_Body");
    for (const body of [{ force: true }, [], "close", null]) {
      expect((await t.call("POST", `/api/rooms/${code}/close`, host.cookie, body)).status).toBe(400);
    }
    expect((await roomRow(t, code)).status).toBe("results");
    expect((await t.call("POST", `/api/rooms/${code}/close`, host.cookie, {})).status).toBe(200);
  });

  test("closing during a race is refused (409 in_race)", async () => {
    const { code, host } = await roomAfterRace(t, "C11_Twice");
    expect((await t.call("POST", `/api/rooms/${code}/launch`, host.cookie)).status).toBe(200);
    const racing = await t.call("POST", `/api/rooms/${code}/close`, host.cookie);
    expect(racing.status).toBe(409);
    expect((await roomRow(t, code)).status).toBe("racing");
  });

  test("COURSE-01 — closing outside the results screen is refused (409 not_results), never a 500", async () => {
    const { room, host } = await t.open("C11_Waiting_Hote", { bots: false });
    const res = await t.call("POST", `/api/rooms/${room.code}/close`, host.cookie);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "not_results" });
    expect((await roomRow(t, room.code)).status).toBe("waiting");
  });

  test("closing an already closed room answers 404", async () => {
    const { code, host } = await roomAfterRace(t, "C11_Again");
    expect((await t.call("POST", `/api/rooms/${code}/close`, host.cookie)).status).toBe(200);
    expect((await t.call("POST", `/api/rooms/${code}/close`, host.cookie)).status).toBe(404);
  });

  test("a closed room can no longer be joined", async () => {
    const { code, host } = await roomAfterRace(t, "C11_Join");
    await t.call("POST", `/api/rooms/${code}/close`, host.cookie);
    expect((await t.join(t.guest("C11_Late"), { code })).status).toBe(404);
  });
});
