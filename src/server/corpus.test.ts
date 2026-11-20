import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { corpusTexts } from "../../db/schema";
import { createEmptyDatabase, createMockDatabase } from "../../db/mocks/test-database";
import { pickPassage } from "./corpus";

const LEVELS = ["common", "rich", "expert"] as const;
const words = (body: string) => body.trim().split(/\s+/).length;

describe("CONF-03 — coherent texts come from the corpus stored in the database", () => {
  let empty: Awaited<ReturnType<typeof createEmptyDatabase>>;
  let db: Awaited<ReturnType<typeof createMockDatabase>>;
  beforeAll(async () => {
    empty = await createEmptyDatabase(); // migrations only, as in production (no seed)
    db = await createMockDatabase();
  });

  test("the migrations alone load public-domain passages for every language and level, each with its source", async () => {
    for (const language of ["fr", "en"] as const) {
      for (const level of LEVELS) {
        const rows = await empty.select().from(corpusTexts).where(and(eq(corpusTexts.language, language), eq(corpusTexts.type, "coherent"), eq(corpusTexts.level, level)));
        expect(rows.length).toBeGreaterThanOrEqual(2);
        for (const row of rows) {
          expect(row.source?.trim().length).toBeGreaterThan(0);
          expect(words(row.body)).toBeGreaterThanOrEqual(30);
        }
      }
    }
  });

  test("every coherent passage of the demo database is a sourced public-domain passage", async () => {
    const rows = await db.select().from(corpusTexts).where(eq(corpusTexts.type, "coherent"));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => (row.source ?? "").length > 0)).toBe(true);
  });

  test("passages are typeable: no guillemets, em dashes or curly quotes", async () => {
    const rows = await empty.select({ body: corpusTexts.body }).from(corpusTexts).where(eq(corpusTexts.type, "coherent"));
    for (const { body } of rows) expect(body).not.toMatch(/[«»—–“”’‘…]/);
  });

  test("the server picks a passage in the room language and level", async () => {
    for (const language of ["fr", "en"] as const) {
      for (const level of LEVELS) {
        const passage = await pickPassage(empty, { language, level, words: 25 });
        expect(passage).not.toBeNull();
        const [row] = await empty.select().from(corpusTexts).where(eq(corpusTexts.id, passage!.id));
        expect(row).toMatchObject({ language, level, type: "coherent", body: passage!.body });
      }
    }
  });

  test("a passage long enough for the requested length is preferred", async () => {
    const rows = await empty.select().from(corpusTexts).where(and(eq(corpusTexts.language, "en"), eq(corpusTexts.type, "coherent"), eq(corpusTexts.level, "common")));
    const longest = Math.max(...rows.map((row) => words(row.body)));
    for (let i = 0; i < 10; i++) {
      const passage = await pickPassage(empty, { language: "en", level: "common", words: longest });
      expect(words(passage!.body)).toBe(longest);
    }
  });

  test("quotes and other types are never picked as a coherent passage", async () => {
    for (let i = 0; i < 20; i++) {
      const passage = await pickPassage(db, { language: "fr", level: "rich", words: 10 });
      const [row] = await db.select({ type: corpusTexts.type }).from(corpusTexts).where(eq(corpusTexts.id, passage!.id));
      expect(row!.type).toBe("coherent");
    }
  });

  test("without a passage at that level, another level of the same language is used; none in the language gives null", async () => {
    const local = await createEmptyDatabase();
    await local.delete(corpusTexts).where(and(eq(corpusTexts.language, "fr"), eq(corpusTexts.level, "expert")));
    const passage = await pickPassage(local, { language: "fr", level: "expert", words: 50 });
    const [row] = await local.select().from(corpusTexts).where(eq(corpusTexts.id, passage!.id));
    expect(row!.language).toBe("fr");
    await local.delete(corpusTexts).where(eq(corpusTexts.language, "fr"));
    expect(await pickPassage(local, { language: "fr", level: "common", words: 50 })).toBeNull();
  });
});
