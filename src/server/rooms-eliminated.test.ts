// COURSE-06 / COURSE-09 : un coureur éliminé par le serveur (mode fatal, eliminated_at) a fini sa course, comme un
// abandon : quand tous les autres ont fini, la course sans limite de temps passe aux résultats.
import { beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { rooms } from "../../db/schema";
import { COUNTDOWN_MS } from "../rooms/race-clock";
import { eliminateRunner, recordProgress } from "./rooms";
import { roomsFixture } from "./rooms.fixture";

type Fixture = Awaited<ReturnType<typeof roomsFixture>>;

describe("COURSE-06 — an elimination seen by the server ends the race like an abandon", () => {
  let t: Fixture;
  beforeAll(async () => {
    t = await roomsFixture();
  });

  /** Deux humains, sans bots ni limite de temps, en mode fatal, partis il y a 20 s. */
  const raced = async (name: string) => {
    const { room, host } = await t.open(name, { bots: false, guests: 2, duration: null, mistakes: "fatal" });
    const other = await t.signUp(`${name}_2`);
    const joined = await t.join(other.cookie, { code: room.code });
    expect(joined.status).toBe(200);
    expect((await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie)).status).toBe(200);
    await t.db.update(rooms).set({ launchedAt: sql`now() - ${20_000 + COUNTDOWN_MS} * interval '1 millisecond'` }).where(eq(rooms.code, room.code));
    const [row] = await t.db.select({ launchedAt: rooms.launchedAt }).from(rooms).where(eq(rooms.code, room.code));
    return { code: room.code, host: host.key, other: joined.body.you, startsAt: row!.launchedAt!.getTime() + COUNTDOWN_MS };
  };
  const status = async (code: string) => (await t.db.select({ status: rooms.status }).from(rooms).where(eq(rooms.code, code)))[0]!.status;

  test("the other runner finishes, then the last one is eliminated: the room goes to the results", async () => {
    const { code, host, other, startsAt } = await raced("Elim_Fin_Apres");
    await recordProgress(t.db, code, other, 1);
    expect(await status(code)).toBe("racing");
    expect(await eliminateRunner(t.db, code, startsAt, host, 0.4)).toBe(true);
    expect(await status(code)).toBe("results");
  });

  test("one runner is eliminated, then the other finishes: the room goes to the results", async () => {
    const { code, host, other, startsAt } = await raced("Elim_Fin_Avant");
    expect(await eliminateRunner(t.db, code, startsAt, host, 0.4)).toBe(true);
    expect(await status(code)).toBe("racing");
    await recordProgress(t.db, code, other, 1);
    expect(await status(code)).toBe("results");
  });
});
