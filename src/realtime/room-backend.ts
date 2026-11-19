// Les salons en base, vus du serveur temps réel (TECH-06, SALLE-03 à 09). La logique reste dans src/server/rooms.ts ;
// ce module traduit le joueur d'un ticket en identité de salon et donne au serveur ce qu'il pousse aux pages.
// Les changements faits par les routes HTTP (Next.js, Vercel) arrivent par `changes` : NOTIFY de Postgres en
// production (room-events.ts), un émetteur en mémoire dans les tests.
import type { Db } from "../../db/client";
import { leaveAfterDisconnect, readRoom, refreshRoom, RoomRefused, roomIdByCode, roomView, type Identity } from "../server/rooms";
import type { Player } from "./protocol";

export type RoomState = Record<string, unknown> & { code: string; members: { key: string }[] };

export type RoomBackend = {
  /** Le salon vu par ce joueur et sa clé de membre ; null s'il n'en est pas membre ou si le salon n'existe pas. */
  enter(player: Player, code: string): Promise<{ key: string; room: RoomState } | null>;
  /** L'état courant d'un salon ; null s'il est fermé ou n'existe pas. */
  view(code: string): Promise<RoomState | null>;
  /** SALLE-08 / SALLE-09 : échéances et membres silencieux ; vrai si le salon a changé. `present` : clés des membres connectés. */
  refresh(code: string, present: string[]): Promise<boolean>;
  /** Le joueur n'a plus de page salle ouverte depuis `awayMs` : il quitte le salon, sauf pendant une course (SALLE-09). */
  leave(player: Player, code: string, awayMs: number): Promise<boolean>;
  /** S'abonne aux salons changés par les routes HTTP ; renvoie la fonction qui désabonne. */
  changes(listener: (code: string) => void): () => void;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** L'identité de salon d'un joueur de ticket (realtime-ticket.ts) : `u:<playerId>` ou `g:<id de session invitée>`. */
export function identityOf(player: Player): Identity | null {
  const account = player.id.match(/^u:(\d+)$/);
  if (account && !player.guest) return { kind: "account", playerId: Number(account[1]), name: player.name };
  const guest = player.id.match(/^g:(.+)$/);
  if (guest && player.guest && UUID.test(guest[1]!)) return { kind: "guest", name: player.name, sessionId: guest[1]! };
  return null;
}

type Changes = { on(listener: (code: string) => void): () => void };

export function createRoomBackend(db: Db, changes: Changes): RoomBackend {
  const refused = (error: unknown) => {
    if (error instanceof RoomRefused) return null;
    throw error;
  };
  return {
    async enter(player, code) {
      const who = identityOf(player);
      if (!who) return null;
      try {
        const { you, room } = await readRoom(db, code, who);
        return { key: you, room: room as RoomState };
      } catch (error) {
        return refused(error);
      }
    },
    async view(code) {
      const id = await roomIdByCode(db, code);
      if (id === null) return null;
      try {
        return (await roomView(db, id)) as RoomState;
      } catch (error) {
        return refused(error);
      }
    },
    refresh: (code, present) => refreshRoom(db, code, present),
    async leave(player, code, awayMs) {
      const who = identityOf(player);
      if (!who) return false;
      try {
        return (await leaveAfterDisconnect(db, code, who, awayMs)).left;
      } catch (error) {
        return refused(error) ?? false;
      }
    },
    changes: (listener) => changes.on(listener),
  };
}
