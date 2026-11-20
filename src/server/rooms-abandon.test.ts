// COURSE-07 : un participant abandonne la course (POST /api/rooms/:code/abandon). Le serveur garde l'abandon et la
// progression qu'il a validée à ce moment ; un abandon compte comme une fin pour la course (COURSE-09).
import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq, sql } from "drizzle-orm";
import { roomMembers, rooms } from "../../db/schema";
import { COUNTDOWN_MS } from "../rooms/race-clock";
import { roomsFixture, type Joined, type Refused } from "./rooms.fixture";
import { recordProgress } from "./rooms";

type Fixture = Awaited<ReturnType<typeof roomsFixture>>;
type Member = { key: string; abandoned?: boolean };

describe("COURSE-07 — a runner abandons the race, recorded by the server", () => {
  let t: Fixture;
  const changed: string[] = [];
  beforeAll(async () => {
    t = await roomsFixture((code) => void changed.push(code));
  });
  const launch = async (code: string, cookie: string) => expect((await t.call("POST", `/api/rooms/${code}/launch`, cookie)).status).toBe(200);
  /** La course a commencé : le décompte est passé. */
  const started = (code: string) => t.db.update(rooms).set({ launchedAt: sql`now() - ${COUNTDOWN_MS + 5000} * interval '1 millisecond'` }).where(eq(rooms.code, code));
  const abandon = async (code: string, cookie?: string, body?: unknown) => {
    const res = await t.call("POST", `/api/rooms/${code}/abandon`, cookie, body);
    return { status: res.status, body: (await res.json()) as Joined & Refused };
  };
  const row = async (code: string, key: string) => {
    const [room] = await t.db.select({ id: rooms.id }).from(rooms).where(eq(rooms.code, code));
    return (await t.db.select().from(roomMembers).where(and(eq(roomMembers.roomId, room!.id), eq(roomMembers.memberKey, key))))[0]!;
  };
  /** Un salon de deux humains (l'hôte et un invité), en course. */
  const racingPair = async (name: string) => {
    const { room, host } = await t.open(name, { bots: false });
    const cookie = t.guest(`${name}_Inv`);
    const guest = await t.join(cookie, { code: room.code });
    expect(guest.status).toBe(200);
    await launch(room.code, host.cookie);
    await started(room.code);
    return { code: room.code, host, guest: { cookie, key: guest.body.you } };
  };

  test("a runner abandons during the race: recorded with the progress the server validated", async () => {
    const { code, host } = await racingPair("Abandon_Nominal");
    await recordProgress(t.db, code, host.key, 0.4);
    changed.length = 0;
    const res = await abandon(code, host.cookie);
    expect(res.status).toBe(200);
    const me = (res.body.room.members as Member[]).find((m) => m.key === host.key)!;
    expect(me.abandoned).toBe(true);
    const stored = await row(code, host.key);
    expect(stored.abandonedAt).not.toBeNull();
    expect(stored.finishedAt).toBeNull();
    expect(stored.progress).toBeCloseTo(0.4);
    expect(changed).toEqual([code]); // le temps réel l'apprend (il refuse ensuite sa progression)
  });

  test("abandoning twice is idempotent: the first abandon is kept", async () => {
    const { code, host } = await racingPair("Abandon_Deux");
    expect((await abandon(code, host.cookie)).status).toBe(200);
    const first = (await row(code, host.key)).abandonedAt;
    const again = await abandon(code, host.cookie);
    expect(again.status).toBe(200);
    expect((await row(code, host.key)).abandonedAt).toEqual(first);
  });

  test("two abandons sent at once both succeed and leave one abandon", async () => {
    const { code, guest } = await racingPair("Abandon_Double");
    const [a, b] = await Promise.all([abandon(code, guest.cookie), abandon(code, guest.cookie)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect((await row(code, guest.key)).abandonedAt).not.toBeNull();
  });

  test("the progress is frozen: the server ignores any progress sent after the abandon", async () => {
    const { code, guest } = await racingPair("Abandon_Gel");
    await recordProgress(t.db, code, guest.key, 0.3);
    await abandon(code, guest.cookie);
    expect(await recordProgress(t.db, code, guest.key, 0.6)).toBe(false);
    expect(await recordProgress(t.db, code, guest.key, 1)).toBe(false);
    const stored = await row(code, guest.key);
    expect(stored.progress).toBeCloseTo(0.3);
    expect(stored.finishedAt).toBeNull();
  });

  test("the race ends when the last human still racing abandons (COURSE-09)", async () => {
    const { code, host, guest } = await racingPair("Abandon_Dernier");
    await recordProgress(t.db, code, host.key, 1);
    expect((await t.read(host.cookie, code)).body.room.status).toBe("racing");
    const res = await abandon(code, guest.cookie);
    expect(res.status).toBe(200);
    expect(res.body.room.status).toBe("results");
  });

  test("a lone human with bots who abandons ends the race", async () => {
    const { room, host } = await t.open("Abandon_Seul", { bots: true, guests: 3 });
    await launch(room.code, host.cookie);
    await started(room.code);
    expect((await abandon(room.code, host.cookie)).body.room.status).toBe("results");
  });

  test("one runner abandoning does not end the race of the others", async () => {
    const { code, host } = await racingPair("Abandon_Pas_Fin");
    expect((await abandon(code, host.cookie)).body.room.status).toBe("racing");
  });

  test("refused before the launch (409 not_racing), nothing written", async () => {
    const { room, host } = await t.open("Abandon_Attente", { bots: true, guests: 2 });
    const res = await abandon(room.code, host.cookie);
    expect(res.status).toBe(409);
    expect(res.body as Refused).toEqual({ error: "not_racing" });
    expect((await row(room.code, host.key)).abandonedAt).toBeNull();
  });

  test("refused during the countdown: the race has not started", async () => {
    const { room, host } = await t.open("Abandon_Decompte", { bots: true, guests: 2 });
    await launch(room.code, host.cookie);
    const res = await abandon(room.code, host.cookie);
    expect(res.status).toBe(409);
    expect(res.body as Refused).toEqual({ error: "not_racing" });
    expect((await row(room.code, host.key)).abandonedAt).toBeNull();
  });

  test("refused after the race (results)", async () => {
    const { code, host, guest } = await racingPair("Abandon_Apres");
    await recordProgress(t.db, code, host.key, 1);
    await recordProgress(t.db, code, guest.key, 1);
    expect((await abandon(code, guest.cookie)).status).toBe(409);
    expect((await row(code, guest.key)).abandonedAt).toBeNull();
  });

  test("refused once the time is up (after endsAt), even before the server closes the race", async () => {
    const { room, host } = await t.open("Abandon_Temps", { bots: true, guests: 2, duration: 60 });
    await launch(room.code, host.cookie);
    // 0,5 s après la fin (départ + 60 s), dans la marge (RACE_GRACE_MS) où la salle est encore « racing »
    await t.db.update(rooms).set({ launchedAt: sql`now() - ${COUNTDOWN_MS + 60_500} * interval '1 millisecond'` }).where(eq(rooms.code, room.code));
    expect((await t.read(host.cookie, room.code)).body.room.status).toBe("racing");
    const res = await abandon(room.code, host.cookie);
    expect(res.status).toBe(409);
    expect(res.body as Refused).toEqual({ error: "not_racing" });
    expect((await row(room.code, host.key)).abandonedAt).toBeNull();
  });

  test("a runner who already finished cannot abandon (409 already_finished)", async () => {
    const { code, host } = await racingPair("Abandon_Fini");
    await recordProgress(t.db, code, host.key, 1);
    const res = await abandon(code, host.cookie);
    expect(res.status).toBe(409);
    expect(res.body as Refused).toEqual({ error: "already_finished" });
    expect((await row(code, host.key)).abandonedAt).toBeNull();
  });

  test("a spectator calling the API directly is refused (403 not_player), nothing written", async () => {
    const { code, host } = await racingPair("Abandon_Specta");
    // l'hôte passe spectateur pendant la course (directement en base : l'interface ne le permet pas)
    await t.db.update(roomMembers).set({ role: "spectator", seat: null, color: null }).where(eq(roomMembers.memberKey, host.key));
    const res = await abandon(code, host.cookie);
    expect(res.status).toBe(403);
    expect(res.body as Refused).toEqual({ error: "not_player" });
    expect((await row(code, host.key)).abandonedAt).toBeNull();
  });

  test("a non-member is refused like an unknown room (404), and without session (401)", async () => {
    const { code } = await racingPair("Abandon_Etranger");
    expect((await abandon(code, t.guest("Abandon_Passant"))).status).toBe(404);
    expect((await abandon(code)).status).toBe(401);
  });

  test("an unknown field or a broken body is refused (400)", async () => {
    const { code, host } = await racingPair("Abandon_Corps");
    expect((await abandon(code, host.cookie, { progress: 1 })).status).toBe(400);
    expect((await abandon(code, host.cookie, null)).status).toBe(400);
    expect((await abandon(code, host.cookie, [])).status).toBe(400);
    expect((await t.call("GET", `/api/rooms/${code}/abandon`, host.cookie)).status).toBe(404);
    const broken = await t.call("POST", `/api/rooms/${code}/abandon`, host.cookie, "{");
    expect(broken.status).toBe(400);
    expect((await row(code, host.key)).abandonedAt).toBeNull();
  });

  test("a new launch clears the abandon", async () => {
    const { code, host, guest } = await racingPair("Abandon_Relance");
    await abandon(code, guest.cookie);
    await recordProgress(t.db, code, host.key, 1);
    expect((await t.read(host.cookie, code)).body.room.status).toBe("results");
    await launch(code, host.cookie);
    expect((await row(code, guest.key)).abandonedAt).toBeNull();
  });
});
