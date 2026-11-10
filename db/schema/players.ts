import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, text, timestamp, unique, uniqueIndex } from "drizzle-orm/pg-core";

/** Identité en jeu (humains, invités, bots). Les identifiants de connexion restent à part. */
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

/** Un invité ou un bot n'a pas de compte. */
export const accounts = pgTable("accounts", {
  playerId: integer("player_id").primaryKey().references(() => players.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
});

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
