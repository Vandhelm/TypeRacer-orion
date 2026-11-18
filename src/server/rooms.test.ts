import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { players, raceConfigs, rooms } from "../../db/schema";
import { DEFAULT_CONFIG } from "../../db/mocks/data";
import { createMockDatabase } from "../../db/mocks/test-database";
import { newInviteToken } from "../rooms/access";
import { CodeExhausted, withFreshCode } from "./rooms";

type TestDb = Awaited<ReturnType<typeof createMockDatabase>>;

/** Une ligne de salon minimale, pour forcer une collision de code. */
async function insertRoom(db: TestDb, code: string) {
  const [host] = await db.select({ id: players.id }).from(players).where(eq(players.name, "Maki_77"));
  const [config] = await db.insert(raceConfigs).values(DEFAULT_CONFIG).returning({ id: raceConfigs.id });
  const [row] = await db
    .insert(rooms)
    .values({ code, inviteToken: newInviteToken(), name: "Test", visibility: "public", guests: 4, bots: true, hostId: host!.id, configId: config!.id })
    .returning({ id: rooms.id, code: rooms.code });
  return row!;
}

describe("SALLE-02 — unique room code", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createMockDatabase();
  });

  test("a code already taken is drawn again instead of failing", async () => {
    const draws = ["CRABE7", "NUVEA2"];
    const row = await withFreshCode((code) => insertRoom(db, code), () => draws.shift()!);
    expect(row.code).toBe("NUVEA2");
    expect(draws).toHaveLength(0);
  });

  test("gives up with CodeExhausted after too many collisions, never a raw database error", async () => {
    await expect(withFreshCode((code) => insertRoom(db, code), () => "CRABE7", 3)).rejects.toBeInstanceOf(CodeExhausted);
  });

  test("other database errors are not swallowed", async () => {
    await expect(withFreshCode(() => insertRoom(db, "bad-code"))).rejects.not.toBeInstanceOf(CodeExhausted);
  });
});
