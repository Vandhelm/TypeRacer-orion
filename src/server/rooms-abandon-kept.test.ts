// COURSE-10 : l'abandon d'un membre reste connu du salon jusqu'au lancement suivant, même s'il en part.
import { beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { rooms } from "../../db/schema";
import { COUNTDOWN_MS } from "../rooms/race-clock";
import { roomsFixture } from "./rooms.fixture";
import { keepProgress, recordProgress, type RoomView } from "./rooms";

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
    const joined = await t.join(leaver, { code: created.code });
    expect(joined.status).toBe(200);
    expect((await t.join(stayer, { code: created.code })).status).toBe(200);
    expect((await t.call("POST", `/api/rooms/${created.code}/launch`, host.cookie)).status).toBe(200);
    const launchedAgo = COUNTDOWN_MS + 5000;
    await t.db.update(rooms).set({ launchedAt: sql`now() - ${launchedAgo} * interval '1 millisecond'` }).where(eq(rooms.code, created.code));
    return { code: created.code, host, leaver, leaverKey: joined.body.you, stayer };
  };
  const names = (view: RoomView) => (view.abandoned ?? []).map((a) => a.name);

  test("a member who abandons then leaves is still listed as abandoned by the room, with his progress", async () => {
    const { code, host, leaver, leaverKey } = await racingTrio("Garde_Part");
    await recordProgress(t.db, code, leaverKey, 0.6);
    expect((await t.call("POST", `/api/rooms/${code}/abandon`, leaver)).status).toBe(200);
    expect((await t.call("POST", `/api/rooms/${code}/leave`, leaver)).status).toBe(200);
    const view = await room(host.cookie, code);
    expect(view.members.map((m) => m.name)).not.toContain("Garde_Part_Part");
    expect(view.abandoned).toEqual([{ name: "Garde_Part_Part", progress: 0.6 }]);
  });

  test("the progress the realtime server keeps after the abandon is the one remembered, even after he leaves", async () => {
    const { code, host, leaver, leaverKey } = await racingTrio("Garde_Garde");
    await recordProgress(t.db, code, leaverKey, 0.3);
    expect((await t.call("POST", `/api/rooms/${code}/abandon`, leaver)).status).toBe(200);
    const [row] = await t.db.select({ launchedAt: rooms.launchedAt }).from(rooms).where(eq(rooms.code, code));
    await keepProgress(t.db, code, row!.launchedAt!.getTime() + COUNTDOWN_MS, [{ key: leaverKey, progress: 0.45 }]);
    await t.call("POST", `/api/rooms/${code}/leave`, leaver);
    expect((await room(host.cookie, code)).abandoned).toEqual([{ name: "Garde_Garde_Part", progress: 0.45 }]);
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
    expect(names(await room(host.cookie, code))).toEqual(["Garde_Deux_Part"]);
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
