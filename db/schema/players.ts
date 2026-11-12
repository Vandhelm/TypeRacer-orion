import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, text, timestamp, unique, uniqueIndex } from "drizzle-orm/pg-core";

/** Identité en jeu (humains, invités, bots). Un compte (table `user`) pointe vers son joueur ; un invité ou un bot n'en a pas. */
export const players = pgTable(
  "players",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull(),
    isBot: boolean("is_bot").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("players_name_lower_unique").on(sql`lower(${table.name})`)],
);


/** La bibliothèque de textes personnalisés d'un joueur. */
export const savedTexts = pgTable(
  "saved_texts",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    playerId: integer("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("saved_texts_player_name_unique").on(table.playerId, table.name), check("saved_texts_body_length", sql`length(${table.body}) <= 5000`)],
);
