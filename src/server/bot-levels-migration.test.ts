// BOT-01 : la migration 0031 ramène les listes de bots déjà enregistrées (lent, moyen, rapide) aux cinq niveaux.
import { describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { createMockDatabase } from "../../db/mocks/test-database";
import { rooms } from "../../db/schema";

const MIGRATION = await Bun.file(new URL("../../db/migrations/0032_bot_levels.sql", import.meta.url)).text();

describe("BOT-01 — the stored bot lists move to the five levels", () => {
  test("slow, medium and fast become beginner, intermediate and expert, in seat order; new levels and empty lists are kept", async () => {
    const db = await createMockDatabase();
    const [first, second] = await db.select({ id: rooms.id }).from(rooms).limit(2);
    const legacy = [{ name: "Wasabi99", level: "slow" }, { name: "Ebi_Fry", level: "fast" }, { name: "Uni_Kun", level: "medium" }, { name: "Tako_San", level: "noob" }];
    await db.execute(sql`update rooms set bot_list = ${JSON.stringify(legacy)}::jsonb where id = ${first!.id}`);
    await db.execute(sql`update rooms set bot_list = '[]'::jsonb, bots = false where id = ${second!.id}`);
    await db.execute(sql.raw(MIGRATION));
    const [migrated] = await db.select({ botList: rooms.botList }).from(rooms).where(eq(rooms.id, first!.id));
    expect(migrated!.botList).toEqual([{ name: "Wasabi99", level: "beginner" }, { name: "Ebi_Fry", level: "expert" }, { name: "Uni_Kun", level: "intermediate" }, { name: "Tako_San", level: "noob" }]);
    const [empty] = await db.select({ botList: rooms.botList }).from(rooms).where(eq(rooms.id, second!.id));
    expect(empty!.botList).toEqual([]);
  });
});
