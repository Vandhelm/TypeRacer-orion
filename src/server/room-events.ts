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

/**
 * Les annonces reçues par LISTEN, pour createRoomBackend ; un code invalide est ignoré (TECH-07).
 * Base injoignable au démarrage : on journalise et on réessaie, sans arrêter le serveur temps réel
 * (présence et progression continuent ; les pages relisent l'état par HTTP en attendant).
 */
export function roomChanges(
  listen: (channel: string, onMessage: (payload: string) => void) => unknown,
  { retryMs = 5_000, log = console.error }: { retryMs?: number; log?: (...args: unknown[]) => void } = {},
) {
  const listeners = new Set<Listener>();
  const onMessage = (payload: string) => {
    if (!isRoomCode(payload)) return;
    for (const listener of listeners) listener(payload);
  };
  const start = () => {
    Promise.resolve()
      .then(() => listen(ROOM_CHANNEL, onMessage))
      .catch((error: unknown) => {
        log(`LISTEN ${ROOM_CHANNEL} failed, retrying in ${retryMs} ms:`, error instanceof Error ? error.message : error);
        setTimeout(start, retryMs).unref?.();
      });
  };
  start();
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
