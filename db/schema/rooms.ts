import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, primaryKey, text, timestamp, unique } from "drizzle-orm/pg-core";
import { botAccuracy, botSpeed, language, level, mistakeMode, roomStatus, textLength, textType, visibility } from "./enums";
import { players } from "./players";
import { CODE_PATTERN } from "../../src/rooms/access";

/** Réglages d'une course, immuables : modifier un salon crée une nouvelle ligne, pour que chaque course garde les siens. */
export const raceConfigs = pgTable(
  "race_configs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    language: language("language").notNull(),
    botSpeed: botSpeed("bot_speed").notNull(),
    botAccuracy: botAccuracy("bot_accuracy").notNull(),
    textType: textType("text_type").notNull(),
    length: textLength("length").notNull(),
    wordCount: integer("word_count").notNull(),
    duration: integer("duration").notNull(),
    level: level("level").notNull(),
    punctuation: boolean("punctuation").notNull(),
    numbers: boolean("numbers").notNull(),
    specials: boolean("specials").notNull(),
    accents: boolean("accents").notNull(),
    mistakes: mistakeMode("mistakes").notNull(),
    excluded: text("excluded").notNull().default(""),
    customText: text("custom_text").notNull().default(""),
  },
  (table) => [
    check("race_configs_word_count_positive", sql`${table.wordCount} > 0`),
    check("race_configs_duration_positive", sql`${table.duration} > 0`),
    check("race_configs_custom_text_length", sql`length(${table.customText}) <= 5000`),
  ],
);

export const rooms = pgTable(
  "rooms",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    code: text("code").notNull().unique(),
    /** Jeton du lien d'invitation : seule entrée d'un salon privé. */
    inviteToken: text("invite_token").notNull().unique(),
    name: text("name").notNull(),
    autoName: boolean("auto_name").notNull().default(true),
    visibility: visibility("visibility").notNull(),
    guests: integer("guests").notNull(),
    bots: boolean("bots").notNull(),
    status: roomStatus("status").notNull().default("waiting"),
    hostId: integer("host_id").notNull().references(() => players.id),
    configId: integer("config_id").notNull().references(() => raceConfigs.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("rooms_lobby").on(table.status, table.visibility), check("rooms_guests_range", sql`${table.guests} between 2 and 8`),
    check("rooms_code_format", sql`${table.code} ~ ${sql.raw(`'${CODE_PATTERN}'`)}`),
  ],
);

/** Qui occupe quelle place. La couleur dépend de la place, pas du joueur. */
export const roomMembers = pgTable(
  "room_members",
  {
    roomId: integer("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
    playerId: integer("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
    seat: integer("seat").notNull(),
    color: text("color").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.roomId, table.playerId] }),
    unique("room_members_room_seat_unique").on(table.roomId, table.seat),
    index("room_members_player").on(table.playerId),
    check("room_members_seat_range", sql`${table.seat} between 0 and 7`),
  ],
);
