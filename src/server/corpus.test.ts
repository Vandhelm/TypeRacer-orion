import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { corpusTexts } from "../../db/schema";
import { createEmptyDatabase, createMockDatabase } from "../../db/mocks/test-database";
import { composePassage, pickPassage } from "./corpus";

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

  test("the passage is in the room language and starts with a whole corpus passage", async () => {
    for (const language of ["fr", "en"] as const) {
      const passage = await pickPassage(empty, { language, words: 25 });
      expect(passage).not.toBeNull();
      const [row] = await empty.select().from(corpusTexts).where(eq(corpusTexts.id, passage!.id));
      expect(row).toMatchObject({ language, type: "coherent" });
      expect(passage!.body.startsWith(row!.body)).toBe(true);
    }
  });

  // CONF-04 : la longueur demandée est atteinte, même au-delà de la taille du corpus de la langue
  for (const language of ["fr", "en"] as const) {
    for (const target of [100, 300, 1000]) {
      test(`${language}, ${target} words: the text reaches the requested length`, async () => {
        for (let i = 0; i < 5; i++) {
          const passage = await pickPassage(empty, { language, words: target });
          expect(words(passage!.body)).toBeGreaterThanOrEqual(target);
        }
      });
    }
  }

  test("a longer text chains whole passages of the same language, with every source", async () => {
    const passage = await pickPassage(empty, { language: "fr", words: 300 });
    const rows = await empty.select().from(corpusTexts).where(and(eq(corpusTexts.language, "fr"), eq(corpusTexts.type, "coherent")));
    let rest = passage!.body;
    const used = new Set<string>();
    while (rest.length) {
      const next = rows.find((row) => rest.startsWith(row.body));
      expect(next).toBeDefined();
      used.add(next!.source!);
      rest = rest.slice(next!.body.length).trimStart();
    }
    expect(used.size).toBeGreaterThan(1);
    for (const source of used) expect(passage!.source).toContain(source);
  });

  test("the same start gives the same text: every reader of the room gets the race text again", async () => {
    const first = await pickPassage(empty, { language: "en", words: 300 });
    const again = await composePassage(empty, { language: "en", words: 300, startId: first!.id });
    expect(again).toEqual(first);
  });

  test("the level is not a filter in coherent mode (the room disables it): every level can be drawn", async () => {
    const levels = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const passage = await pickPassage(empty, { language: "fr", words: 10 });
      const [row] = await empty.select({ level: corpusTexts.level }).from(corpusTexts).where(eq(corpusTexts.id, passage!.id));
      levels.add(row!.level);
    }
    expect(levels.size).toBeGreaterThan(1);
  });

  test("quotes and other types are never part of a coherent text", async () => {
    const quotes = await db.select({ body: corpusTexts.body }).from(corpusTexts).where(eq(corpusTexts.type, "quote"));
    for (let i = 0; i < 10; i++) {
      const passage = await pickPassage(db, { language: "en", words: 1000 });
      for (const { body } of quotes) expect(passage!.body).not.toContain(body);
    }
  });

  test("no passage in the language gives null; a start removed from the corpus gives null", async () => {
    const local = await createEmptyDatabase();
    const start = await pickPassage(local, { language: "fr", words: 50 });
    await local.delete(corpusTexts).where(eq(corpusTexts.id, start!.id));
    expect(await composePassage(local, { language: "fr", words: 50, startId: start!.id })).toBeNull();
    await local.delete(corpusTexts).where(eq(corpusTexts.language, "fr"));
    expect(await pickPassage(local, { language: "fr", words: 50 })).toBeNull();
  });
});
