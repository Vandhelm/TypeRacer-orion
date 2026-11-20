// COURSE-02 : la règle de lancement, partagée par le serveur (launchRoom, qui la fait respecter) et la salle (qui grise
// le bouton Lancer et dit pourquoi). Au moins 2 participants, dont au moins 1 humain ; les bots comptent, les spectateurs non.
import { BOT_NAMES } from "../players/bots";
import type { Role } from "./settings";

export const MIN_PARTICIPANTS = 2;

/** Pourquoi la course ne peut pas partir : aucun humain qui court, ou trop peu de participants. Null : elle peut partir. */
export type LaunchBlocker = "no_human" | "too_few";

/**
 * Les bots occupent les places libres (rooms.guests moins les humains qui courent), un par nom de la liste fermée,
 * comme seatsOf dans la salle. Les spectateurs n'ont pas de place et ne courent pas.
 */
export function launchBlocker(room: { guests: number; bots: boolean }, members: { role: Role }[]): LaunchBlocker | null {
  const humans = members.filter((m) => m.role === "player").length;
  if (humans < 1) return "no_human";
  const bots = room.bots ? Math.min(Math.max(room.guests - humans, 0), BOT_NAMES.length) : 0;
  return humans + bots < MIN_PARTICIPANTS ? "too_few" : null;
}
