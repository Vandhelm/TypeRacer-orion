// Les salons publics de l'explorateur, lus sur le serveur (SALLE-03 : jamais les salons « sur code » ni privés).
// JOIN-02 : complexité, hôte et état sur chaque ticket, filtres langue et complexité, liste relue à intervalle régulier.
import { canJoin } from "../../rooms/access";
import { roomFiltersQuery, type RoomFilters } from "../../rooms/explorer";
import type { ListedRoom } from "../../server/rooms";

export type Room = {
  n: number;
  serial: string;
  code: string;
  lang: ListedRoom["language"];
  guests: string;
  bots: boolean;
  level: ListedRoom["level"];
  host: string;
  status: ListedRoom["status"];
  /** SALLE-09 : faux pendant une course ; le ticket est affiché mais ne se prend pas. */
  joinable: boolean;
};

export const WAITING_PAGE = "/room";

/** Rythme de relecture de la liste : le temps réel ne suit que les salons dont on est membre (src/realtime). */
export const ROOMS_POLL_MS = 5000;

const HOST_MAX = 12;

/** Un nom d'hôte assez court pour une ligne de ticket (20 caractères au plus en base). */
export function shortName(name: string): string {
  return name.length > HOST_MAX ? `${name.slice(0, HOST_MAX - 1)}…` : name;
}

/**
 * Un ticket par salon public, dans l'ordre du serveur. JOIN-02 : un salon en course est affiché avec son état ;
 * SALLE-09 : il ne se prend pas (joinable faux), et le serveur refuse de toute façon l'entrée (« in_race »).
 */
export function tablesOf(list: ListedRoom[]): Room[] {
  return list.map((room, i) => ({
    n: i + 1,
    serial: room.code,
    code: room.code,
    lang: room.language,
    guests: `${room.players} / ${room.guests}`,
    bots: room.bots,
    level: room.level,
    host: room.host,
    status: room.status,
    joinable: canJoin(room.status),
  }));
}

/** La liste filtrée ; null si le serveur ne répond pas, pour garder la liste affichée plutôt que de la vider. */
export async function fetchPublicRooms(filters: RoomFilters = {}): Promise<Room[] | null> {
  try {
    const res = await fetch(`/api/rooms${roomFiltersQuery(filters)}`, { credentials: "same-origin" });
    if (!res.ok) return null;
    const { rooms } = (await res.json()) as { rooms: ListedRoom[] };
    return tablesOf(rooms);
  } catch {
    return null;
  }
}

type WatchOptions = {
  load?: (filters: RoomFilters) => Promise<Room[] | null>;
  every?: number;
  /** Vrai quand l'onglet est caché : on ne relit pas, on relira en revenant. */
  hidden?: () => boolean;
  /** Une lecture a échoué (serveur injoignable) ; la liste affichée reste la dernière reçue. */
  onFail?: () => void;
};

const pageHidden = () => typeof document !== "undefined" && document.hidden;

/**
 * JOIN-02 : suit la liste des salons publics sans rechargement. Lecture tout de suite, puis toutes les `every` ms,
 * jamais deux à la fois, pas quand l'onglet est caché (relue dès qu'il revient). Renvoie la fonction qui arrête.
 */
export function watchPublicRooms(filters: RoomFilters, onRooms: (rooms: Room[]) => void, { load = fetchPublicRooms, every = ROOMS_POLL_MS, hidden = pageHidden, onFail }: WatchOptions = {}): () => void {
  let stopped = false;
  let pending = false;
  const read = async () => {
    if (stopped || pending || hidden()) return;
    pending = true;
    try {
      const rooms = await load(filters);
      if (stopped) return;
      if (rooms) onRooms(rooms);
      else onFail?.();
    } finally {
      pending = false;
    }
  };
  const onVisibility = () => void read();
  void read();
  const timer = setInterval(() => void read(), every);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
  return () => {
    stopped = true;
    clearInterval(timer);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
  };
}
