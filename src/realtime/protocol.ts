// Protocole temps réel (TECH-06), partagé par le serveur (src/realtime/server.ts) et le client (src/realtime/client.ts).
// TECH-07 : chaque message reçu par le serveur passe par ClientMessage ; tout le reste est rejeté.
// L'identité n'est jamais dans un message : le serveur la tient du ticket présenté à la connexion.
import { z } from "zod";
import { CODE_PATTERN } from "../rooms/access";
import { MAX_HUMAN_WPM } from "./referee";

/** Un message plus long est refusé par le serveur avant même d'être lu. */
export const MAX_MESSAGE_BYTES = 1024;
/** PERF-02 : au plus 10 progressions par seconde, par salle et par joueur, côté client comme côté serveur. */
export const PROGRESS_PER_SECOND = 10;
export const PROGRESS_INTERVAL_MS = 1000 / PROGRESS_PER_SECOND;
/** COURSE-06 : au-delà du MPM humain maximal de l'arbitre (300), un message de progression est refusé. */
export const WPM_MAX = MAX_HUMAN_WPM;

export const RoomCode = z.string().regex(new RegExp(CODE_PATTERN));

export const ClientMessage = z.discriminatedUnion("type", [
  // follow : la page salle suit l'état du salon (membres, réglages, hôte) ; il faut en être membre (SALLE-03).
  z.object({ type: z.literal("join"), room: RoomCode, follow: z.literal(true).optional() }).strict(),
  z.object({ type: z.literal("leave") }).strict(),
  // Progression = caractères validés ÷ longueur du texte (annexe A), donc entre 0 et 1.
  z.object({ type: z.literal("progress"), progress: z.number().min(0).max(1), wpm: z.number().min(0).max(WPM_MAX) }).strict(),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export const Player = z.object({ id: z.string(), name: z.string(), guest: z.boolean() });
export type Player = z.infer<typeof Player>;

// not_member : le salon suivi n'admet pas (ou plus) ce joueur, ou n'existe pas (SALLE-07, SALLE-10 : même réponse).
// COURSE-06 : une progression refusée par l'arbitre (src/realtime/referee.ts) n'est ni gardée ni diffusée.
export const ERROR_CODES = [
  "invalid_message",
  "not_in_room",
  "not_member",
  "not_a_runner",
  "race_not_started",
  "race_over",
  "progress_backward",
  "progress_jump",
  "progress_too_fast",
] as const;

/** COURSE-06 : la place d'un coureur au classement du serveur ; `finishedMs` : temps d'arrivée depuis le départ serveur. */
export const Standing = z.object({ playerId: z.string(), rank: z.number().int().min(1), progress: z.number().min(0).max(1), wpm: z.number().min(0).max(WPM_MAX), finishedMs: z.number().nullable() });

export const ServerMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("welcome"), you: Player }),
  z.object({ type: z.literal("presence"), room: RoomCode, players: z.array(Player) }),
  z.object({ type: z.literal("progress"), playerId: z.string(), progress: z.number(), wpm: z.number().min(0).max(WPM_MAX) }),
  z.object({ type: z.literal("error"), code: z.enum(ERROR_CODES) }),
  // l'état d'un salon suivi (follow), tel que le lit GET /api/rooms/:code, sans lien d'invitation (SALLE-04)
  z.object({ type: z.literal("room"), room: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal("closed"), room: RoomCode }),
  // COURSE-06 : le départ et la fin décidés par le serveur (ms epoch), et son classement des coureurs
  z.object({ type: z.literal("standings"), room: RoomCode, startsAt: z.number(), endsAt: z.number().nullable(), players: z.array(Standing) }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;

function parse<T>(schema: z.ZodType<T>, data: unknown): T | null {
  if (typeof data !== "string") return null;
  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch {
    return null;
  }
  const result = schema.safeParse(json);
  return result.success ? result.data : null;
}

/** Le message d'un client, ou null s'il n'est pas du JSON valide conforme au protocole. */
export const parseClientMessage = (data: unknown) => parse(ClientMessage, data);
/** Le message du serveur, ou null : le client ignore ce qu'il ne comprend pas. */
export const parseServerMessage = (data: unknown) => parse(ServerMessage, data);
