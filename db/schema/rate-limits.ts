import { integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/**
 * SALLE-10 : compteurs de tentatives à fenêtre fixe, en base pour être partagés entre les instances (Vercel).
 * Une ligne par règle et par clé (une IP) ; la fenêtre repart à la première tentative après son expiration.
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    bucket: text("bucket").notNull(),
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true, mode: "date" }).notNull(),
    count: integer("count").notNull(),
  },
  (table) => [primaryKey({ columns: [table.bucket, table.key] })],
);
