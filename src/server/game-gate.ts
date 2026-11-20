// COURSE-02, SALLE-09 : /game ne fait courir que dans un salon que le serveur a lancé (launchRoom, qui applique le
// minimum de participants). Vérifié par le serveur avant de rendre la page, pas seulement par le navigateur.
// COURSE-08 : un coureur abandonné (bouton ou silence) dont la course n'est pas encore enregistrée entre pour l'enregistrer
// avec la marque d'abandon, même si la salle est passée aux résultats ; une fois enregistrée, il va au podium.
import { and, eq } from "drizzle-orm";
import type { Db } from "../../db/client";
import { roomMembers, rooms } from "../../db/schema";
import { cleanRoomCode, isRoomCode } from "../rooms/access";
import { readRoom, RoomRefused, type Identity } from "./rooms";
import { roomHrefOutsideRace } from "../views/room/room";

/** Où renvoyer ce visiteur de /game ; null : son salon est en course (ou il doit enregistrer son abandon), il entre. */
export async function gameDetour(db: Db, rawCode: string | undefined, who: Identity): Promise<string | null> {
  const code = cleanRoomCode(rawCode ?? "");
  if (!isRoomCode(code)) return "/home";
  try {
    const { room, you } = await readRoom(db, code, who);
    if (room.members.find((m) => m.key === you)?.abandoned && (room.status === "racing" || room.status === "results")) {
      return (await raceRecorded(db, code, you)) ? "/podium" : null;
    }
    return roomHrefOutsideRace(room.status, room.code);
  } catch (error) {
    if (error instanceof RoomRefused) return "/home"; // SALLE-10 : un non-membre ne sait pas si le salon existe
    throw error;
  }
}

/** COURSE-06 : ce membre a déjà enregistré la course de ce lancement (claimServerRace). */
async function raceRecorded(db: Db, code: string, key: string): Promise<boolean> {
  const [row] = await db
    .select({ recorded: roomMembers.raceRecorded })
    .from(roomMembers)
    .innerJoin(rooms, eq(rooms.id, roomMembers.roomId))
    .where(and(eq(rooms.code, code), eq(roomMembers.memberKey, key)));
  return row?.recorded ?? false;
}
