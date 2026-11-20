// COURSE-10 : l'abandon d'un membre reste connu du salon jusqu'au lancement suivant, même s'il en part.
import { beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { rooms } from "../../db/schema";
import { COUNTDOWN_MS } from "../rooms/race-clock";
import { roomsFixture } from "./rooms.fixture";
import type { RoomView } from "./rooms";

describe("COURSE-10 — the room keeps who abandoned the last race, even after they leave", () => {
  let t: Awaited<ReturnType<typeof roomsFixture>>;
  beforeAll(async () => {
    t = await roomsFixture();
  });
  const room = async (cookie: string, code: string) => (await t.read(cookie, code)).body.room as unknown as RoomView;
  /** Un salon de trois humains (l'hôte et deux invités), en course. */
  const racingTrio = async (name: string) => {
    const { room: created, host } = await t.open(name, { bots: false });
    const leaver = t.guest(`${name}_Part`);
    const stayer = t.guest(`${name}_Reste`);
    expect((await t.join(leaver, { code: created.code })).status).toBe(200);
    expect((await t.join(stayer, { code: created.code })).status).toBe(200);
    expect((await t.call("POST", `/api/rooms/${created.code}/launch`, host.cookie)).status).toBe(200);
    await t.db.update(rooms).set({ launchedAt: sql`now() - ${COUNTDOWN_MS + 5000} * interval '1 millisecond'` }).where(eq(rooms.code, created.code));
    return { code: created.code, host, leaver, stayer };
  };

  test("a member who abandons then leaves is still listed as abandoned by the room", async () => {
    const { code, host, leaver } = await racingTrio("Garde_Part");
    expect((await t.call("POST", `/api/rooms/${code}/abandon`, leaver)).status).toBe(200);
    expect((await t.call("POST", `/api/rooms/${code}/leave`, leaver)).status).toBe(200);
    const view = await room(host.cookie, code);
    expect(view.members.map((m) => m.name)).not.toContain("Garde_Part_Part");
    expect(view.abandoned).toEqual(["Garde_Part_Part"]);
  });

  test("nobody abandoned: the list is empty; a runner who just leaves is not an abandon", async () => {
    const { code, host, stayer } = await racingTrio("Garde_Rien");
    expect((await room(host.cookie, code)).abandoned).toEqual([]);
    expect((await t.call("POST", `/api/rooms/${code}/leave`, stayer)).status).toBe(200);
    expect((await room(host.cookie, code)).abandoned).toEqual([]);
  });

  test("abandoning twice lists the member once", async () => {
    const { code, host, leaver } = await racingTrio("Garde_Deux");
    await t.call("POST", `/api/rooms/${code}/abandon`, leaver);
    await t.call("POST", `/api/rooms/${code}/abandon`, leaver);
    expect((await room(host.cookie, code)).abandoned).toEqual(["Garde_Deux_Part"]);
  });

  test("a refused abandon (spectator, before the start) lists nobody", async () => {
    const { room: created, host } = await t.open("Garde_Tot", { bots: false });
    const guest = t.guest("Garde_Tot_Inv");
    await t.join(guest, { code: created.code });
    await t.call("POST", `/api/rooms/${created.code}/launch`, host.cookie);
    expect((await t.call("POST", `/api/rooms/${created.code}/abandon`, guest)).status).toBe(409);
    expect((await room(host.cookie, created.code)).abandoned).toEqual([]);
  });

  test("a new launch clears the list", async () => {
    const { code, host, leaver } = await racingTrio("Garde_Relance");
    await t.call("POST", `/api/rooms/${code}/abandon`, leaver);
    await t.db.update(rooms).set({ status: "results" }).where(eq(rooms.code, code));
    expect((await t.call("POST", `/api/rooms/${code}/launch`, host.cookie)).status).toBe(200);
    expect((await room(host.cookie, code)).abandoned).toEqual([]);
  });
});
