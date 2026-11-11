import { beforeAll, describe, expect, test } from "bun:test";
import { eq, isNull, sql } from "drizzle-orm";
import { account, corpusTexts, players, raceConfigs, raceResults, races, raceSamples, roomMembers, rooms } from "../schema";
import { CORPUS } from "./corpus";
import { DEFAULT_CONFIG, DEMO_PASSWORD, PLAYERS, RACES, ROOMS } from "./data";
import { seed } from "./seed";
import { createEmptyDatabase, createMockDatabase } from "./test-database";

const entries = RACES.flatMap((race) => race.entries);
const fails = (query: PromiseLike<unknown>) => expect(Promise.resolve(query)).rejects.toThrow();

describe("schema", () => {
  let db: Awaited<ReturnType<typeof createEmptyDatabase>>;
  beforeAll(async () => {
    db = await createEmptyDatabase();
  });

  test("creates every table", async () => {
    const { rows } = await db.execute<{ table_name: string }>(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`);
    expect(rows.map((row) => row.table_name)).toEqual(["account", "corpus_texts", "players", "race_configs", "race_results", "race_samples", "races", "room_members", "rooms", "saved_texts", "session", "user", "verification"]);
  });

  test("enforces foreign keys", async () => {
    await fails(db.insert(account).values({ id: "a", accountId: "a", providerId: "credential", userId: "missing" }));
  });

  test("rejects a value outside the game options", async () => {
    await fails(db.execute(sql`INSERT INTO corpus_texts (language, type, level, body) VALUES ('de', 'quote', 'common', 'x')`));
  });

  test("rejects an ambiguous or malformed room code", async () => {
    const [host] = await db.insert(players).values({ name: "Code_Host" }).returning({ id: players.id });
    const [config] = await db.insert(raceConfigs).values(DEFAULT_CONFIG).returning({ id: raceConfigs.id });
    const room = { name: "x", visibility: "public" as const, guests: 4, bots: true, hostId: host!.id, configId: config!.id };
    await fails(db.insert(rooms).values({ ...room, code: "CORAIL", inviteToken: "a" }));
    await fails(db.insert(rooms).values({ ...room, code: "ABC23", inviteToken: "b" }));
    await db.insert(rooms).values({ ...room, code: "ABC234", inviteToken: "c" });
    await fails(db.insert(rooms).values({ ...room, code: "ABC235", inviteToken: "c" }));
  });

  test("treats player names as case-insensitive", async () => {
    await db.insert(players).values({ name: "Unique_Fish" });
    await fails(db.insert(players).values({ name: "unique_fish" }));
  });
});

describe("demo data", () => {
  let db: Awaited<ReturnType<typeof createMockDatabase>>;
  beforeAll(async () => {
    db = await createMockDatabase();
  });

  test("fills the corpus, the users and the history", async () => {
    expect(await db.$count(players)).toBe(PLAYERS.length);
    expect(await db.$count(corpusTexts)).toBe(CORPUS.length);
    expect(await db.$count(rooms)).toBe(ROOMS.length);
    expect(await db.$count(races)).toBe(RACES.length);
    expect(await db.$count(raceResults)).toBe(entries.length);
    expect(await db.$count(raceSamples)).toBe(entries.reduce((total, entry) => total + entry.seconds, 0));
  });

  test("covers both languages in the corpus", async () => {
    expect(await db.$count(corpusTexts, eq(corpusTexts.language, "fr"))).toBeGreaterThan(0);
    expect(await db.$count(corpusTexts, eq(corpusTexts.language, "en"))).toBeGreaterThan(0);
  });

  test("gives every race settings matching its text", async () => {
    const rows = await db.select({ language: raceConfigs.language, text: corpusTexts.language }).from(races).innerJoin(raceConfigs, eq(races.configId, raceConfigs.id)).innerJoin(corpusTexts, eq(races.textId, corpusTexts.id));
    expect(rows).toHaveLength(RACES.length);
    expect(rows.every((row) => row.language === row.text)).toBe(true);
  });

  test("refuses to seed twice", async () => {
    expect(seed(db)).rejects.toThrow("db:reset");
  });

  test("accounts accept the demo password", async () => {
    const [row] = await db.select().from(account).limit(1);
    expect(await Bun.password.verify(DEMO_PASSWORD, row!.password!)).toBe(true);
  });

  test("refuses two players on one seat", async () => {
    const [member] = await db.select().from(roomMembers).limit(1);
    const [stranger] = await db.select().from(players).where(eq(players.name, "Saba_Sensei"));
    await fails(db.insert(roomMembers).values({ roomId: member!.roomId, playerId: stranger!.id, seat: member!.seat, color: "red" }));
  });
});

describe("independent runs", () => {
  test("produces the same history every time", async () => {
    const dump = async () => (await createMockDatabase()).select().from(raceSamples).orderBy(raceSamples.raceId, raceSamples.playerId, raceSamples.second);
    expect(await dump()).toEqual(await dump());
  }, 30000);

  test("race history survives deleting the room", async () => {
    const db = await createMockDatabase();
    await db.delete(rooms).where(eq(rooms.status, "closed"));
    expect(await db.$count(races, isNull(races.roomId))).toBe(RACES.length);
  }, 30000);
});

describe("auth migration over an old Better Auth install", () => {
  const legacy = async (withRow: boolean) => {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const { MIGRATIONS_DIR } = await import("../client");
    const client = new PGlite();
    await client.exec(`CREATE TABLE "user" ("id" text PRIMARY KEY, "name" text); CREATE TABLE "account" ("id" text PRIMARY KEY, "accountId" text); CREATE TABLE "rateLimit" ("id" text PRIMARY KEY);`);
    if (withRow) await client.exec(`INSERT INTO "user" VALUES ('u1', 'Keep me')`);
    return migrate(drizzle(client), { migrationsFolder: MIGRATIONS_DIR });
  };

  test("drops the old tables when they are empty", async () => {
    await legacy(false);
  });

  test("stops when an old table still holds rows", async () => {
    await expect(legacy(true)).rejects.toThrow();
  });
});
