// Réglages d'un salon (TECH-07) : un seul schéma, lu par le serveur pour valider ce que l'hôte envoie,
// et par la page du salon pour ses types et ses valeurs par défaut.
import { z } from "zod";
import { isRoomCode, VISIBILITIES } from "./access";

export const MIN_GUESTS = 2;
/** SALLE-05 : capacité en participants (les spectateurs n'y comptent pas) ; rooms_guests_range et les places suivent. */
export const MAX_GUESTS = 30;
export const MAX_NAME_LENGTH = 28;
export const MAX_TEXT_LENGTH = 5000;
/** CONF-01 : temps maximal d'une course, en secondes ; `null` = aucun (la course ne s'arrête pas au temps). */
export const MIN_DURATION = 30;
export const MAX_DURATION = 600;
export const DEFAULT_DURATION = 120;
export const DurationSchema = z.number().int().min(MIN_DURATION).max(MAX_DURATION).nullable();

export const LANGUAGES = ["fr", "en"] as const;
export const BOT_SPEEDS = ["slow", "medium", "fast", "mixed"] as const;
export const BOT_ACCURACIES = ["shaky", "decent", "high"] as const;
export const TEXT_TYPES = ["coherent", "quote", "words", "custom"] as const;
export const TEXT_LENGTHS = ["very-short", "short", "medium", "long", "other"] as const;
export const LEVELS = ["common", "rich", "expert"] as const;
export const MISTAKE_MODES = ["fix", "carry-on", "fatal"] as const;
/** SALLE-01 : participant (a une place et court) ou spectateur (regarde seulement). */
export const ROLES = ["player", "spectator"] as const;
export type Role = (typeof ROLES)[number];

export const RoomSettingsSchema = z
  .object({
    name: z.string().trim().max(MAX_NAME_LENGTH),
    autoName: z.boolean(),
    visibility: z.enum(VISIBILITIES),
    guests: z.number().int().min(MIN_GUESTS).max(MAX_GUESTS),
    bots: z.boolean(),
    language: z.enum(LANGUAGES),
    botSpeed: z.enum(BOT_SPEEDS),
    botAccuracy: z.enum(BOT_ACCURACIES),
    textType: z.enum(TEXT_TYPES),
    length: z.enum(TEXT_LENGTHS),
    wordCount: z.number().int().min(1).max(1000),
    duration: DurationSchema,
    level: z.enum(LEVELS),
    punctuation: z.boolean(),
    numbers: z.boolean(),
    specials: z.boolean(),
    accents: z.boolean(),
    mistakes: z.enum(MISTAKE_MODES),
    excluded: z.string().max(20),
    text: z.string().max(MAX_TEXT_LENGTH),
    /** CONF-09 : bonus de remontée activés ou non ; désactivés par défaut. */
    catchUpBonus: z.boolean(),
  })
  .strict();

export type RoomSettings = z.infer<typeof RoomSettingsSchema>;

export const DEFAULT_SETTINGS: RoomSettings = {
  name: "",
  autoName: true,
  visibility: "private",
  guests: 4,
  bots: true,
  language: "fr",
  botSpeed: "medium",
  botAccuracy: "decent",
  textType: "coherent",
  length: "medium",
  wordCount: 50,
  duration: DEFAULT_DURATION,
  level: "common",
  punctuation: false,
  numbers: false,
  specials: false,
  accents: true,
  mistakes: "fix",
  excluded: "",
  text: "",
  catchUpBonus: false,
};

/**
 * CONF-04 : une citation n'a que des longueurs prédéfinies (elle reste entière) ; une longueur libre y est ramenée à
 * « moyen », comme le fait le salon. Appliqué par le serveur à chaque création et modification d'un salon.
 */
export function normalizeSettings(settings: RoomSettings): RoomSettings {
  return settings.textType === "quote" && settings.length === "other" ? { ...settings, length: "medium" } : settings;
}

/** POST /api/rooms : le rôle de l'hôte et, au besoin, des réglages de départ. Rien d'autre (ni hôte, ni code). */
export const CreateRoomSchema = z.object({ role: z.enum(ROLES), settings: RoomSettingsSchema.partial().optional() }).strict();
/** PATCH /api/rooms/:code : l'hôte change ses réglages ou son propre rôle. */
export const UpdateRoomSchema = z.object({ role: z.enum(ROLES).optional(), settings: RoomSettingsSchema.partial().optional() }).strict();
/** POST /api/rooms/:code/kick — SALLE-07 : la clé du membre à expulser (« player:<id> » ou « guest:<id de session> »). */
export const KickSchema = z.object({ member: z.string().min(1).max(200) }).strict();
/** POST /api/rooms/join : un code de salon, ou un jeton d'invitation, jamais les deux. */
/** SALLE-05 : on entre comme participant (par défaut) ou comme spectateur, qui ne prend pas de place. */
export const JoinRoomSchema = z.union([
  z.object({ code: z.string().refine(isRoomCode), role: z.enum(ROLES).optional() }).strict(),
  z.object({ invite: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/), role: z.enum(ROLES).optional() }).strict(),
]);
