// COURSE-09 : le serveur fait passer le salon aux résultats quand tous les participants ont terminé ou abandonné, ou quand
// le temps maximal (endsAt) est écoulé ; sans limite de temps, seule la première règle s'applique.
import { beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { rooms } from "../../db/schema";
import { COUNTDOWN_MS } from "../rooms/race-clock";
import { recordProgress, refreshRoom } from "./rooms";
import { roomsFixture, type Joined, type Refused } from "./rooms.fixture";

type Fixture = Awaited<ReturnType<typeof roomsFixture>>;

describe("COURSE-09 — the server ends the race when every runner finished or abandoned, or when the time is up", () => {
  let t: Fixture;
  beforeAll(async () => {
    t = await roomsFixture();
  });
  /** La course est lancée depuis `ms` millisecondes (décompte compris). */
  const launchedAgo = (code: string, ms: number) => t.db.update(rooms).set({ launchedAt: sql`now() - ${ms} * interval '1 millisecond'` }).where(eq(rooms.code, code));
  const status = async (code: string, cookie: string) => (await t.read(cookie, code)).body.room.status;
  const abandon = async (code: string, cookie: string) => {
    const res = await t.call("POST", `/api/rooms/${code}/abandon`, cookie);
    return { status: res.status, body: (await res.json()) as Joined & Refused };
  };
  /** Un salon de trois humains (l'hôte et deux invités) en course, depuis 5 s après le départ ; `settings` du salon. */
  const racing = async (name: string, settings: Record<string, unknown> = {}) => {
    const { room, host } = await t.open(name, { bots: false, ...settings });
    const runners = [{ cookie: host.cookie, key: host.key }];
    for (const n of [1, 2]) {
      const cookie = t.guest(`${name}_${n}`);
      const joined = await t.join(cookie, { code: room.code });
      expect(joined.status).toBe(200);
      runners.push({ cookie, key: joined.body.you });
    }
    expect((await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie)).status).toBe(200);
    await launchedAgo(room.code, COUNTDOWN_MS + 5_000);
    return { code: room.code, host, runners };
  };

  test("everyone arrived: the room moves to results at the last arrival, not before", async () => {
    const { code, host, runners } = await racing("Fin_Arrives");
    await recordProgress(t.db, code, runners[0]!.key, 1);
    await recordProgress(t.db, code, runners[1]!.key, 1);
    expect(await status(code, host.cookie)).toBe("racing");
    expect(await recordProgress(t.db, code, runners[2]!.key, 1)).toBe(true);
    expect(await status(code, host.cookie)).toBe("results");
  });

  test("everyone abandoned: the room moves to results at the last abandon", async () => {
    const { code, runners } = await racing("Fin_Abandons");
    expect((await abandon(code, runners[0]!.cookie)).body.room.status).toBe("racing");
    expect((await abandon(code, runners[1]!.cookie)).body.room.status).toBe("racing");
    expect((await abandon(code, runners[2]!.cookie)).body.room.status).toBe("results");
  });

  test("a mix of arrivals and abandons ends the race, whichever comes last", async () => {
    const first = await racing("Fin_Melange_A");
    await abandon(first.code, first.runners[0]!.cookie);
    await recordProgress(t.db, first.code, first.runners[1]!.key, 1);
    expect(await status(first.code, first.host.cookie)).toBe("racing");
    expect((await abandon(first.code, first.runners[2]!.cookie)).body.room.status).toBe("results");

    const second = await racing("Fin_Melange_B");
    await abandon(second.code, second.runners[0]!.cookie);
    await abandon(second.code, second.runners[1]!.cookie);
    expect(await status(second.code, second.host.cookie)).toBe("racing");
    await recordProgress(t.db, second.code, second.runners[2]!.key, 1);
    expect(await status(second.code, second.host.cookie)).toBe("results");
  });

  test("a runner still racing keeps the race open (one arrived, one abandoned)", async () => {
    const { code, host, runners } = await racing("Fin_Encore");
    await recordProgress(t.db, code, runners[0]!.key, 1);
    await abandon(code, runners[1]!.cookie);
    await recordProgress(t.db, code, runners[2]!.key, 0.5);
    expect(await status(code, host.cookie)).toBe("racing");
  });

  test("a spectator does not hold the race: the runners done, the room moves to results", async () => {
    const { room, host } = await t.open("Fin_Specta", { bots: false });
    const watcher = t.guest("Fin_Specta_Vue");
    expect((await t.join(watcher, { code: room.code, role: "spectator" })).status).toBe(200);
    const runner = t.guest("Fin_Specta_Coureur");
    expect((await t.join(runner, { code: room.code })).status).toBe(200);
    expect((await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie)).status).toBe(200);
    await launchedAgo(room.code, COUNTDOWN_MS + 5_000);
    await recordProgress(t.db, room.code, host.key, 1);
    await abandon(room.code, runner);
    expect(await status(room.code, watcher)).toBe("results");
  });

  test("the time is up (endsAt passed): the room moves to results, runners still racing", async () => {
    const { code, host } = await racing("Fin_Temps", { duration: 30 });
    await launchedAgo(code, COUNTDOWN_MS + 30_000 - 2_000);
    expect(await status(code, host.cookie)).toBe("racing");
    await launchedAgo(code, COUNTDOWN_MS + 30_000 + 3_000);
    expect(await status(code, host.cookie)).toBe("results");
  });

  test("the time is up with nobody reading the room: the real-time sweep ends it", async () => {
    const { code, host } = await racing("Fin_Temps_Seul", { duration: 60 });
    await launchedAgo(code, COUNTDOWN_MS + 60_000 + 3_000);
    expect(await refreshRoom(t.db, code)).toBe(true);
    const [row] = await t.db.select({ status: rooms.status }).from(rooms).where(eq(rooms.code, code));
    expect(row!.status).toBe("results");
    expect(await status(code, host.cookie)).toBe("results");
  });

  test("after the time is up, an arrival or an abandon no longer changes anything", async () => {
    const { code, host, runners } = await racing("Fin_Apres", { duration: 30 });
    await launchedAgo(code, COUNTDOWN_MS + 30_000 + 3_000);
    expect(await status(code, host.cookie)).toBe("results");
    expect(await recordProgress(t.db, code, runners[1]!.key, 1)).toBe(false);
    expect((await abandon(code, runners[2]!.cookie)).status).toBe(409);
    expect(await status(code, host.cookie)).toBe("results");
  });

  test("without a time limit, the race never ends on time, only when everyone is done", async () => {
    const { code, host, runners } = await racing("Fin_Sans_Limite", { duration: null });
    await launchedAgo(code, COUNTDOWN_MS + 3 * 3_600_000);
    // les coureurs donnent signe de vie (COURSE-08 : un silence de plus de 30 s serait un abandon)
    expect(await refreshRoom(t.db, code, runners.map((r) => r.key))).toBe(false);
    expect(await status(code, host.cookie)).toBe("racing");
    await recordProgress(t.db, code, runners[0]!.key, 1);
    await abandon(code, runners[1]!.cookie);
    expect(await status(code, host.cookie)).toBe("racing");
    await recordProgress(t.db, code, runners[2]!.key, 1);
    expect(await status(code, host.cookie)).toBe("results");
  });
});
