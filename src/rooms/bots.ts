// CONF-10 : les bots d'un salon, ajoutés et retirés un par un par l'hôte, chacun avec son niveau. Partagé par le serveur
// (validation, places, statut bot de COURSE-06) et la page du salon (liste, places, course).
import { z } from "zod";
import { BOT_NAMES } from "../players/bots";
import type { RoomSettings } from "./settings";

/**
 * Les niveaux d'un bot : les vitesses existantes du moteur (src/views/game/race.ts, BOT_WPM), sans « mixte », qui
 * mélangeait les vitesses de toute la salle. Les cinq niveaux de BOT-01 remplaceront cette liste.
 */
export const BOT_LEVELS = ["slow", "medium", "fast"] as const;
export type BotLevel = (typeof BOT_LEVELS)[number];
export type BotName = (typeof BOT_NAMES)[number];

/** Un bot du salon : un nom de la liste fermée (COURSE-06 : le serveur ne reconnaît qu'elle) et son niveau. */
export const RoomBotSchema = z.object({ name: z.enum(BOT_NAMES), level: z.enum(BOT_LEVELS) }).strict();
export type RoomBot = z.infer<typeof RoomBotSchema>;

/** La liste des bots, dans l'ordre des places ; un nom n'y figure qu'une fois. */
export const BotListSchema = z
  .array(RoomBotSchema)
  .max(BOT_NAMES.length)
  .refine((list) => new Set(list.map((bot) => bot.name)).size === list.length, { message: "duplicate bot" });

/** Le premier nom de la liste fermée qui n'est pas encore pris ; null quand tous le sont. */
export function nextBotName(list: readonly RoomBot[]): BotName | null {
  return BOT_NAMES.find((name) => !list.some((bot) => bot.name === name)) ?? null;
}

/** Une place libre pour un bot de plus : la capacité moins les humains qui courent et les bots déjà là, et un nom libre. */
export function canAddBot(room: { guests: number; botList: readonly RoomBot[] }, humans: number): boolean {
  return room.botList.length + humans < room.guests && nextBotName(room.botList) !== null;
}

/**
 * L'ancien réglage (bots oui) : un bot par place libre, dans l'ordre de la liste fermée, à la vitesse du salon ;
 * « mixte » alterne les niveaux.
 */
export function defaultBots(count: number, speed: RoomSettings["botSpeed"]): RoomBot[] {
  return BOT_NAMES.slice(0, Math.max(0, count)).map((name, i) => ({ name, level: speed === "mixed" ? BOT_LEVELS[i % BOT_LEVELS.length]! : speed }));
}

/**
 * Les bots qui courent : ceux de la liste, dans l'ordre, tant qu'il reste une place après les humains. Un humain entré
 * après l'ajout des bots garde sa place : les derniers bots attendent une place libre. Aucun quand les bots sont coupés.
 */
export function seatedBots(room: { guests: number; bots: boolean; botList: readonly RoomBot[] }, humans: number): RoomBot[] {
  return room.bots ? room.botList.slice(0, Math.max(0, room.guests - humans)) : [];
}

/**
 * Ce que devient la liste après un changement de l'hôte. Une liste envoyée remplace l'ancienne (refusée, « full »,
 * si elle s'allonge au-delà des places libres ; retirer un bot ou changer un niveau passe toujours). L'ancien
 * interrupteur reste compris : « non » vide la liste, « oui » avec une liste vide (ou sans liste, quand la liste
 * actuelle est vide) remplit les places libres.
 * Les bots sont activés exactement quand la liste n'est pas vide.
 */
export function resolveBots(current: RoomSettings, patch: Partial<RoomSettings>, humans: number): Pick<RoomSettings, "bots" | "botList"> | "full" {
  const guests = patch.guests ?? current.guests;
  const filled = () => defaultBots(guests - humans, patch.botSpeed ?? current.botSpeed);
  let botList = current.botList;
  if (patch.bots === false) botList = [];
  else if (patch.botList?.length) {
    if (patch.botList.length > current.botList.length && patch.botList.length + humans > guests) return "full";
    botList = patch.botList;
  } else if (patch.botList) botList = patch.bots ? filled() : [];
  else if (patch.bots && !botList.length) botList = filled();
  return { bots: botList.length > 0, botList };
}
