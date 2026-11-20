// COURSE-06 : le salon donne le départ et la fin décidés par le serveur, et garde la progression validée par lui.
import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { roomMembers, rooms } from "../../db/schema";
import { COUNTDOWN_MS } from "../rooms/race-clock";
import { roomsFixture } from "./rooms.fixture";
import { recordProgress } from "./rooms";

type Fixture = Awaited<ReturnType<typeof roomsFixture>>;
type Clocked = { startsAt: number | null; endsAt: number | null; status: string };

const launch = async (t: Fixture, code: string, cookie: string) => {
  const res = await t.call("POST", `/api/rooms/${code}/launch`, cookie);
  expect(res.status).toBe(200);
  return ((await res.json()) as { room: Clocked }).room;
};
const launchedAt = async (t: Fixture, code: string) => (await t.db.select({ at: rooms.launchedAt }).from(rooms).where(eq(rooms.code, code)))[0]!.at!.getTime();
const member = async (t: Fixture, code: string, key: string) => {
  const [room] = await t.db.select({ id: rooms.id }).from(rooms).where(eq(rooms.code, code));
  return (await t.db.select().from(roomMembers).where(and(eq(roomMembers.roomId, room!.id), eq(roomMembers.memberKey, key))))[0]!;
};

describe("COURSE-06 — the server sets the start and the end of the race", () => {
  let t: Fixture;
  beforeAll(async () => {
    t = await roomsFixture();
  });

  test("before launch, the room has no start nor end", async () => {
    const { room } = await t.open("Depart_Avant", { bots: true, guests: 2 });
    expect((room as unknown as Clocked).startsAt).toBeNull();
    expect((room as unknown as Clocked).endsAt).toBeNull();
  });

  test("server start: launch time plus the countdown; end: start plus the duration", async () => {
    const { room, host } = await t.open("Depart_Serveur", { bots: true, guests: 2, duration: 60 });
    const launched = await launch(t, room.code, host.cookie);
    const at = await launchedAt(t, room.code);
    expect(launched.startsAt).toBe(at + COUNTDOWN_MS);
    expect(launched.endsAt).toBe(at + COUNTDOWN_MS + 60_000);
    // les autres membres le lisent pareil (GET, et le temps réel qui pousse la même vue)
    expect(((await t.read(host.cookie, room.code)).body.room as unknown as Clocked).startsAt).toBe(at + COUNTDOWN_MS);
  });

  test("a race without time limit has a start and no end", async () => {
    const { room, host } = await t.open("Depart_Libre", { bots: true, guests: 2, duration: null });
    const launched = await launch(t, room.code, host.cookie);
    expect(launched.startsAt).toBeNumber();
    expect(launched.endsAt).toBeNull();
  });
});

describe("COURSE-06 — the server finish: progress validated by the realtime server", () => {
  let t: Fixture;
  beforeAll(async () => {
    t = await roomsFixture();
  });

  test("100 % recorded by the server finishes the runner; the last runner ends the race", async () => {
    const { room, host } = await t.open("Fin_Serveur", { bots: false });
    const guest = await t.join(t.guest("Fin_Invite"), { code: room.code });
    await launch(t, room.code, host.cookie);
    expect(await recordProgress(t.db, room.code, host.key, 1)).toBe(true);
    expect((await member(t, room.code, host.key)).finishedAt).not.toBeNull();
    expect((await member(t, room.code, host.key)).progress).toBe(1);
    expect((await t.read(host.cookie, room.code)).body.room.status).toBe("racing");
    await recordProgress(t.db, room.code, guest.body.you, 1);
    expect((await t.read(host.cookie, room.code)).body.room.status).toBe("results");
  });

  test("a partial progress is kept without finishing the runner", async () => {
    const { room, host } = await t.open("Fin_Partielle", { bots: true, guests: 2 });
    await launch(t, room.code, host.cookie);
    await recordProgress(t.db, room.code, host.key, 0.4);
    const row = await member(t, room.code, host.key);
    expect(row.progress).toBeCloseTo(0.4);
    expect(row.finishedAt).toBeNull();
  });

  test("outside a race nothing is recorded", async () => {
    const { room, host } = await t.open("Fin_Hors_Course", { bots: true, guests: 2 });
    expect(await recordProgress(t.db, room.code, host.key, 1)).toBe(false);
    expect((await member(t, room.code, host.key)).progress).toBe(0);
  });

  test("a new launch resets the server progress", async () => {
    const { room, host } = await t.open("Fin_Relance", { bots: true, guests: 2 });
    await launch(t, room.code, host.cookie);
    await recordProgress(t.db, room.code, host.key, 1);
    expect((await t.read(host.cookie, room.code)).body.room.status).toBe("results");
    await launch(t, room.code, host.cookie);
    expect((await member(t, room.code, host.key)).progress).toBe(0);
  });
});
