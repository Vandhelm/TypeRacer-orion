import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { language, level, textType } from "./enums";

/** Le corpus dans lequel on pioche le texte d'une course. */
export const corpusTexts = pgTable(
  "corpus_texts",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    language: language("language").notNull(),
    type: textType("type").notNull(),
    level: level("level").notNull(),
    body: text("body").notNull(),
    /** L'auteur, pour une citation. */
    source: text("source"),
  },
  (table) => [index("corpus_texts_pick").on(table.language, table.type, table.level), check("corpus_texts_body_length", sql`length(${table.body}) <= 5000`)],
);
