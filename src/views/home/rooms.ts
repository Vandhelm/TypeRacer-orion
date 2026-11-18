// Les salons publics de l'explorateur, lus sur le serveur (SALLE-03 : jamais les salons « sur code » ni privés).
import type { ListedRoom } from "../../server/rooms";

export type Room = { n: number; serial: string; code: string; lang: "fr" | "en"; guests: string; bots: boolean };

export const WAITING_PAGE = "/room";

/** Un ticket par salon public, dans l'ordre du serveur. */
export function tablesOf(list: ListedRoom[]): Room[] {
  return list.map((room, i) => ({ n: i + 1, serial: room.code, code: room.code, lang: room.language, guests: `${room.players} / ${room.guests}`, bots: room.bots }));
}

export async function fetchPublicRooms(): Promise<Room[]> {
  try {
    const res = await fetch("/api/rooms", { credentials: "same-origin" });
    if (!res.ok) return [];
    const { rooms } = (await res.json()) as { rooms: ListedRoom[] };
    return tablesOf(rooms);
  } catch {
    return [];
  }
}
