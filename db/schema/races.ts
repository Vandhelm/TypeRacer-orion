import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, pgTable, primaryKey, real, text, timestamp, unique } from "drizzle-orm/pg-core";
import { players } from "./players";
import { raceConfigs, rooms } from "./rooms";
import { corpusTexts } from "./texts";

/** L'historique survit à la fermeture du salon. `content` garde le texte joué, même s'il sort du corpus. */
export const races = pgTable(
  "races",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    roomId: integer("room_id").references(() => rooms.id, { onDelete: "set null" }),
    configId: integer("config_id").notNull().references(() => raceConfigs.id),
    textId: integer("text_id").references(() => corpusTexts.id, { onDelete: "set null" }),
    content: text("content").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [index("races_room").on(table.roomId)],
);

/** Le bilan d'un joueur sur une course (podium et profil). */
export const raceResults = pgTable(
  "race_results",
  {
    raceId: integer("race_id").notNull().references(() => races.id, { onDelete: "cascade" }),
    playerId: integer("player_id").notNull().references(() => players.id),
    rank: integer("rank").notNull(),
    wpm: integer("wpm").notNull(),
    raw: integer("raw").notNull(),
    accuracy: real("accuracy").notNull(),
    seconds: real("seconds").notNull(),
    correctChars: integer("correct_chars").notNull().default(0),
    wrongChars: integer("wrong_chars").notNull().default(0),
    extraChars: integer("extra_chars").notNull().default(0),
    missedChars: integer("missed_chars").notNull().default(0),
    consistency: integer("consistency").notNull(),
    idle: real("idle").notNull(),
    finished: boolean("finished").notNull(),
    eliminated: boolean("eliminated").notNull().default(false),
    sessionSeconds: integer("session_seconds").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.raceId, table.playerId] }),
    unique("race_results_race_rank_unique").on(table.raceId, table.rank),
    index("race_results_player").on(table.playerId, table.raceId),
    check("race_results_rank_positive", sql`${table.rank} >= 1`),
    check("race_results_accuracy_range", sql`${table.accuracy} between 0 and 100`),
    check("race_results_consistency_range", sql`${table.consistency} between 0 and 100`),
    check("race_results_idle_range", sql`${table.idle} between 0 and 100`),
  ],
);

/** Une ligne par joueur et par seconde : le gros volume, pour le graphique seulement. */
export const raceSamples = pgTable(
  "race_samples",
  {
    raceId: integer("race_id").notNull(),
    playerId: integer("player_id").notNull(),
    second: integer("second").notNull(),
    wpm: integer("wpm").notNull(),
    raw: integer("raw").notNull(),
    errors: integer("errors").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.raceId, table.playerId, table.second] }),
    foreignKey({ name: "race_samples_result_fk", columns: [table.raceId, table.playerId], foreignColumns: [raceResults.raceId, raceResults.playerId] }).onDelete("cascade"),
    check("race_samples_second_positive", sql`${table.second} >= 0`),
  ],
);
