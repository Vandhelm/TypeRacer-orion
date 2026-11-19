// Les changements de salon faits par les routes HTTP, annoncés au serveur temps réel (src/realtime/server.ts),
// qui pousse le nouvel état aux pages salle. Les routes tournent sous Next.js (Vercel), le serveur temps réel
// ailleurs (Fly.io) : Postgres fait le lien (NOTIFY ici, LISTEN là-bas). Sans serveur à l'écoute, rien ne se passe :
// les pages relisent l'état par HTTP (watchRoom).
import { sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { isRoomCode } from "../rooms/access";

export const ROOM_CHANNEL = "orion_rooms";

/** Annonce qu'un salon a changé. Une annonce perdue n'est pas une erreur de la requête : la page relira l'état. */
export async function notifyRoom(db: Db, code: string) {
  try {
    await db.execute(sql`select pg_notify(${ROOM_CHANNEL}, ${code})`);
  } catch (error) {
    console.error(error);
  }
}

type Listener = (code: string) => void;

/** Les annonces reçues par LISTEN, pour createRoomBackend ; un code invalide est ignoré (TECH-07). */
export function roomChanges(listen: (channel: string, onMessage: (payload: string) => void) => unknown) {
  const listeners = new Set<Listener>();
  void listen(ROOM_CHANNEL, (payload) => {
    if (!isRoomCode(payload)) return;
    for (const listener of listeners) listener(payload);
  });
  return {
    on(listener: Listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/** Un émetteur en mémoire, pour les tests : les routes émettent, le serveur temps réel du même processus écoute. */
export function memoryRoomEvents() {
  const listeners = new Set<Listener>();
  return {
    emit(code: string) {
      for (const listener of listeners) listener(code);
    },
    on(listener: Listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
