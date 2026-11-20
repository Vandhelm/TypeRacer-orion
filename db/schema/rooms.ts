import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, primaryKey, real, text, timestamp, unique } from "drizzle-orm/pg-core";

/** COURSE-10 : un abandon de la dernière course d'un salon. */
export type RoomAbandon = { key: string; name: string; progress: number; seat: number | null };
/** COURSE-10 : un coureur parti pendant la course sans abandonner ; finishedAt (ISO) s'il était arrivé. */
export type RoomDeparture = RoomAbandon & { finishedAt: string | null };
import { botAccuracy, botSpeed, language, level, memberRole, mistakeMode, roomStatus, textLength, textType, visibility } from "./enums";
import { players } from "./players";
import { corpusTexts } from "./texts";
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
    /** CONF-01 : temps maximal en secondes, null = aucun (pas de fin au temps). */
    duration: integer("duration"),
    level: level("level").notNull(),
    punctuation: boolean("punctuation").notNull(),
    numbers: boolean("numbers").notNull(),
    specials: boolean("specials").notNull(),
    accents: boolean("accents").notNull(),
    /** CONF-06 : majuscules gardées (true) ou texte tout en minuscules (false). */
    capitals: boolean("capitals").notNull().default(true),
    mistakes: mistakeMode("mistakes").notNull(),
    excluded: text("excluded").notNull().default(""),
    customText: text("custom_text").notNull().default(""),
    /** CONF-09 : bonus de remontée activés ou non (les bonus eux-mêmes : BONUS-01 à 04). */
    catchUpBonus: boolean("catch_up_bonus").notNull().default(false),
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
    name: text("name").notNull(),
    autoName: boolean("auto_name").notNull().default(true),
    visibility: visibility("visibility").notNull(),
    guests: integer("guests").notNull(),
    bots: boolean("bots").notNull(),
    status: roomStatus("status").notNull().default("waiting"),
    hostId: integer("host_id").notNull().references(() => players.id),
    configId: integer("config_id").notNull().references(() => raceConfigs.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** SALLE-09 : départ de la course en cours ; elle prend fin d'elle-même à raceDeadlineMs(durée) (src/server/rooms.ts). */
    launchedAt: timestamp("launched_at", { withTimezone: true }),
    /** CONF-03 : le passage du corpus tiré par le serveur au lancement, en mode cohérent ; null sinon. */
    textId: integer("text_id").references(() => corpusTexts.id, { onDelete: "set null" }),
    /** CONF-03 : la graine des mots tirés au hasard (mode aléatoire, chiffres, caractères spéciaux), la même pour tous. */
    textSeed: integer("text_seed"),
    /** COURSE-06 : l'empreinte des mots tirés au lancement (src/rooms/course-words.ts), vérifiée par le serveur temps réel. */
    textHash: text("text_hash"),
    /**
     * COURSE-10 : les membres qui ont abandonné la dernière course lancée (clé, nom, progression validée gardée, place),
     * gardés même s'ils quittent le salon (leur ligne room_members est supprimée) ; vidé au lancement.
     */
    abandons: jsonb("abandons").$type<RoomAbandon[]>().notNull().default([]),
    /** COURSE-10 : les coureurs partis du salon pendant la dernière course sans abandonner (progression validée, arrivée) ; vidé au lancement. */
    departed: jsonb("departed").$type<RoomDeparture[]>().notNull().default([]),
  },
  (table) => [index("rooms_lobby").on(table.status, table.visibility), check("rooms_guests_range", sql`${table.guests} between 2 and 30`),
    check("rooms_code_format", sql`${table.code} ~ ${sql.raw(`'${CODE_PATTERN}'`)}`),
  ],
);

/**
 * Qui est dans quel salon. Un membre est un compte (player_id) ou un invité (guest_name, son pseudonyme signé) :
 * member_key ("player:<id>" ou "guest:<id de session signé>", jamais le pseudonyme) les identifie tous les deux, pour la clé primaire
 * et pour la règle « une seule salle à la fois » (SALLE-06). Un participant a une place (et sa couleur), un spectateur non.
 */
export const roomMembers = pgTable(
  "room_members",
  {
    roomId: integer("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
    memberKey: text("member_key").notNull(),
    playerId: integer("player_id").references(() => players.id, { onDelete: "cascade" }),
    guestName: text("guest_name"),
    role: memberRole("role").notNull().default("player"),
    seat: integer("seat"),
    color: text("color"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    /** SALLE-09 : ce membre a fini la course en cours ; remis à null à chaque lancement. */
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    /** COURSE-06 : la dernière progression validée par le serveur temps réel (0 à 1) ; remise à 0 à chaque lancement. */
    progress: real("progress").notNull().default(0),
    /** COURSE-07 : ce membre a abandonné la course en cours ; sa progression reste celle validée à ce moment. Remis à null à chaque lancement. */
    abandonedAt: timestamp("abandoned_at", { withTimezone: true }),
    /** COURSE-06 : le résultat de ce membre pour la course en cours est déjà enregistré (POST /api/races). */
    raceRecorded: boolean("race_recorded").notNull().default(false),
    /** SALLE-08 : dernier signe de vie (lecture du salon, action) ; silencieux trop longtemps, le membre est parti. */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    /** SALLE-07 : l'IP d'entrée (client-ip.ts), null si inconnue ; à l'expulsion, elle est bannie pour les invités. */
    ip: text("ip"),
  },
  (table) => [
    primaryKey({ columns: [table.roomId, table.memberKey] }),
    unique("room_members_room_seat_unique").on(table.roomId, table.seat),
    // SALLE-06 : une personne (compte ou session d'invité) n'est membre que d'un salon à la fois, garanti par la base
    unique("room_members_member_unique").on(table.memberKey),
    index("room_members_player").on(table.playerId),
    check("room_members_seat_range", sql`${table.seat} between 0 and 29`),
    check("room_members_identity", sql`(${table.playerId} is null) <> (${table.guestName} is null)`),
    check("room_members_seat_role", sql`(${table.role} = 'player') = (${table.seat} is not null)`),
    // COURSE-07 : un membre a fini ou abandonné, jamais les deux
    check("room_members_finished_or_abandoned", sql`${table.finishedAt} is null or ${table.abandonedAt} is null`),
  ],
);

/**
 * SALLE-07 : les personnes expulsées d'un salon (même clé que room_members) ; elles ne peuvent plus y entrer,
 * ni par code, ni par lien. Disparaît avec le salon.
 */
export const roomBans = pgTable(
  "room_bans",
  {
    roomId: integer("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
    memberKey: text("member_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.roomId, table.memberKey] })],
);

/**
 * SALLE-04 : les liens d'invitation, un par invité, seule entrée d'un salon privé. À sa première utilisation, un lien
 * est lié à l'IP et à la personne (member_key) qui l'a utilisé ; used_name garde son nom pour le statut montré à l'hôte.
 * Révoqué (revoked_at) quand son membre est expulsé (SALLE-07) ; invalide dès que le salon est fermé.
 */
export const roomInvites = pgTable(
  "room_invites",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    roomId: integer("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    usedBy: text("used_by"),
    usedName: text("used_name"),
    usedIp: text("used_ip"),
    usedAt: timestamp("used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("room_invites_room").on(table.roomId),
    check("room_invites_used", sql`(${table.usedBy} is null) = (${table.usedIp} is null) and (${table.usedBy} is null) = (${table.usedAt} is null)`),
  ],
);
