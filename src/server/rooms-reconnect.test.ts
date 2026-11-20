// COURSE-08 : un coureur sans signe de vie (lecture du salon, socket de salon) depuis RECONNECT_MS pendant la course est
// considéré comme ayant abandonné ; avant ce délai, il reprend sa course. Le silence est simulé en reculant last_seen_at.
import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq, sql } from "drizzle-orm";
import { roomMembers, rooms } from "../../db/schema";
import { COUNTDOWN_MS } from "../rooms/race-clock";
import { raceExit } from "../views/game/abandon";
import { roomsFixture, type Joined } from "./rooms.fixture";
import { MEMBER_AWAY_MS, RECONNECT_MS, recordProgress, refreshRoom } from "./rooms";

type Fixture = Awaited<ReturnType<typeof roomsFixture>>;
type Member = { key: string; abandoned?: boolean; finished: boolean };

describe("COURSE-08 — a runner who comes back within 30 s resumes, after that he has abandoned", () => {
  let t: Fixture;
  const changed: string[] = [];
  beforeAll(async () => {
    t = await roomsFixture((code) => void changed.push(code));
  });
  /** La course a commencé depuis `ms` (décompte passé). */
  const startedFor = (code: string, ms: number) => t.db.update(rooms).set({ launchedAt: sql`now() - ${COUNTDOWN_MS + ms} * interval '1 millisecond'` }).where(eq(rooms.code, code));
  const silentFor = (key: string, ms: number) => t.db.update(roomMembers).set({ lastSeenAt: sql`now() - ${ms} * interval '1 millisecond'` }).where(eq(roomMembers.memberKey, key));
  const row = async (code: string, key: string) => {
    const [room] = await t.db.select({ id: rooms.id, status: rooms.status }).from(rooms).where(eq(rooms.code, code));
    const [member] = await t.db.select().from(roomMembers).where(and(eq(roomMembers.roomId, room!.id), eq(roomMembers.memberKey, key)));
    return { status: room!.status, member };
  };
  const meIn = (body: Joined, key: string) => (body.room.members as Member[]).find((m) => m.key === key)!;
  /** Deux humains (l'hôte et un invité) en course depuis `ms`. */
  const racingPair = async (name: string, ms = 60_000) => {
    const { room, host } = await t.open(name, { bots: false });
    const cookie = t.guest(`${name}_Inv`);
    const guest = await t.join(cookie, { code: room.code });
    expect(guest.status).toBe(200);
    expect((await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie)).status).toBe(200);
    await startedFor(room.code, ms);
    return { code: room.code, host, guest: { cookie, key: guest.body.you } };
  };

  test("the delay is 30 s, well below the SALLE-08 removal delay", () => {
    expect(RECONNECT_MS).toBe(30_000);
    expect(RECONNECT_MS).toBeLessThan(MEMBER_AWAY_MS);
  });

  test("reload after 10 s: the runner is still racing and reads the same race back", async () => {
    const { code, host, guest } = await racingPair("Reprise_Dix");
    await recordProgress(t.db, code, host.key, 0.3);
    const before = await t.read(host.cookie, code);
    await silentFor(host.key, 10_000);
    await t.read(guest.cookie, code); // un autre membre balaie le salon
    const back = await t.read(host.cookie, code);
    expect(back.status).toBe(200);
    expect(back.body.room.status).toBe("racing");
    expect(meIn(back.body, host.key).abandoned).toBe(false);
    // même texte et même horloge : graine, passage, départ et fin du serveur
    for (const field of ["seed", "passage", "startsAt", "endsAt", "textHash"] as const) expect(back.body.room[field]).toEqual(before.body.room[field]);
    expect(raceExit(back.body.room.status as "racing", code, false)).toBeNull();
    expect((await row(code, host.key)).member!.progress).toBeCloseTo(0.3);
  });

  test("connection lost for 20 s: still racing, the realtime sweep does not abandon him", async () => {
    const { code, host } = await racingPair("Coupure_Vingt");
    await silentFor(host.key, 20_000);
    expect(await refreshRoom(t.db, code)).toBe(false);
    const { member, status } = await row(code, host.key);
    expect(status).toBe("racing");
    expect(member!.abandonedAt).toBeNull();
  });

  test("connection lost for 31 s: abandoned by the server sweep, progress kept, the realtime learns it", async () => {
    const { code, host, guest } = await racingPair("Coupure_Trente");
    await recordProgress(t.db, code, host.key, 0.45);
    await silentFor(host.key, 31_000);
    expect(await refreshRoom(t.db, code, [guest.key])).toBe(true); // le temps réel annonce le changement à la salle
    const { member, status } = await row(code, host.key);
    expect(member!.abandonedAt).not.toBeNull();
    expect(member!.finishedAt).toBeNull();
    expect(member!.progress).toBeCloseTo(0.45);
    expect(status).toBe("racing"); // l'invité court encore
    // l'abandon compte comme une fin : le dernier coureur arrivé termine la course
    await recordProgress(t.db, code, guest.key, 1);
    expect((await row(code, guest.key)).status).toBe("results");
  });

  test("coming back after 31 s: his own read finds the abandon first, the page goes to the podium", async () => {
    const { code, host } = await racingPair("Retour_Tard");
    await silentFor(host.key, 31_000);
    const back = await t.read(host.cookie, code);
    expect(back.status).toBe(200);
    const me = meIn(back.body, host.key);
    expect(me.abandoned).toBe(true);
    expect(me.finished).toBe(true);
    expect(raceExit(back.body.room.status as "racing", code, me.abandoned!)).toBe("/podium");
  });

  test("the last runner timing out ends the race (counts as a finish)", async () => {
    const { room, host } = await t.open("Seul_Absent"); // contre des bots
    expect((await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie)).status).toBe(200);
    await startedFor(room.code, 60_000);
    await silentFor(host.key, 31_000);
    const back = await t.read(host.cookie, room.code);
    expect(back.body.room.status).toBe("results");
    expect(meIn(back.body, host.key).abandoned).toBe(true);
  });

  test("the 30 s count starts at the race start at the earliest: silent since before the launch, 10 s into the race, still racing", async () => {
    const { code, host } = await racingPair("Depart_Recent", 10_000);
    await silentFor(host.key, 60_000);
    await refreshRoom(t.db, code);
    expect((await row(code, host.key)).member!.abandonedAt).toBeNull();
  });

  test("no abandon during the countdown, nor once the race time is up (he is ranked by progress)", async () => {
    const counting = await racingPair("Pendant_Decompte", -COUNTDOWN_MS + 500);
    await silentFor(counting.host.key, 31_000);
    await refreshRoom(t.db, counting.code);
    expect((await row(counting.code, counting.host.key)).member!.abandonedAt).toBeNull();

    const over = await racingPair("Temps_Fini", 0);
    // durée du salon, plus 5 s : le temps est écoulé, la salle attend encore la marge de SALLE-09
    const clock = (await t.read(over.host.cookie, over.code)).body.room as { startsAt: number; endsAt: number };
    await startedFor(over.code, clock.endsAt - clock.startsAt + 5_000);
    await silentFor(over.host.key, 31_000);
    await refreshRoom(t.db, over.code);
    expect((await row(over.code, over.host.key)).member!.abandonedAt).toBeNull();
  });

  test("a spectator or a runner who already finished is never abandoned by silence", async () => {
    const { code, host, guest } = await racingPair("Fini_Absent");
    await recordProgress(t.db, code, guest.key, 1);
    await silentFor(guest.key, 31_000);
    await refreshRoom(t.db, code, [host.key]);
    const { member } = await row(code, guest.key);
    expect(member!.abandonedAt).toBeNull();
    expect(member!.finishedAt).not.toBeNull();

    const watched = await t.open("Spectateur_Absent", {}, "spectator");
    const runner = t.guest("Spect_Run");
    const joined = await t.join(runner, { code: watched.room.code });
    expect(joined.status).toBe(200);
    expect((await t.call("POST", `/api/rooms/${watched.room.code}/launch`, watched.host.cookie)).status).toBe(200);
    await startedFor(watched.room.code, 60_000);
    await silentFor(watched.host.key, 31_000);
    await refreshRoom(t.db, watched.room.code, [joined.body.you]);
    expect((await row(watched.room.code, watched.host.key)).member!.abandonedAt).toBeNull();
  });

  test("SALLE-08 unchanged: a member silent for more than 90 s is still removed", async () => {
    const { code, host, guest } = await racingPair("Toujours_Retire");
    await silentFor(guest.key, MEMBER_AWAY_MS + 1_000);
    await t.read(host.cookie, code);
    expect((await row(code, guest.key)).member).toBeUndefined();
  });
});
