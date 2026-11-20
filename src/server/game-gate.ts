// COURSE-02, SALLE-09 : /game ne fait courir que dans un salon que le serveur a lancé (launchRoom, qui applique le
// minimum de participants). Vérifié par le serveur avant de rendre la page, pas seulement par le navigateur.
import type { Db } from "../../db/client";
import { cleanRoomCode, isRoomCode } from "../rooms/access";
import { readRoom, RoomRefused, type Identity } from "./rooms";
import { roomHrefOutsideRace } from "../views/room/room";

/** Où renvoyer ce visiteur de /game ; null : son salon est en course, il peut courir. */
export async function gameDetour(db: Db, rawCode: string | undefined, who: Identity): Promise<string | null> {
  const code = cleanRoomCode(rawCode ?? "");
  if (!isRoomCode(code)) return "/home";
  try {
    const { room } = await readRoom(db, code, who);
    return roomHrefOutsideRace(room.status, room.code);
  } catch (error) {
    if (error instanceof RoomRefused) return "/home"; // SALLE-10 : un non-membre ne sait pas si le salon existe
    throw error;
  }
}
