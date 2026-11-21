// COURSE-02 : la règle de lancement, partagée par le serveur (launchRoom, qui la fait respecter) et la salle (qui grise
// le bouton Lancer et dit pourquoi). Au moins 2 participants, dont au moins 1 humain ; les bots comptent, les spectateurs non.
import { defaultBots, seatedBots, type RoomBot } from "./bots";
import type { Role } from "./settings";

export const MIN_PARTICIPANTS = 2;

/** Pourquoi la course ne peut pas partir : aucun humain qui court, ou trop peu de participants. Null : elle peut partir. */
export type LaunchBlocker = "no_human" | "too_few";

/**
 * CONF-10 : les bots de la liste du salon, tant qu'il leur reste une place après les humains qui courent (seatedBots),
 * comme seatsOf dans la salle. Sans liste (ancien réglage), un bot par place libre. Les spectateurs ne courent pas.
 */
export function launchBlocker(room: { guests: number; bots: boolean; botList?: readonly RoomBot[] }, members: { role: Role }[]): LaunchBlocker | null {
  const humans = members.filter((m) => m.role === "player").length;
  if (humans < 1) return "no_human";
  const bots = seatedBots({ ...room, botList: room.botList ?? defaultBots(room.guests - humans, "medium") }, humans).length;
  return humans + bots < MIN_PARTICIPANTS ? "too_few" : null;
}
