// Les salons en base, vus du serveur temps réel (TECH-06, SALLE-03 à 09). La logique reste dans src/server/rooms.ts ;
// ce module traduit le joueur d'un ticket en identité de salon et donne au serveur ce qu'il pousse aux pages.
// Les changements faits par les routes HTTP (Next.js, Vercel) arrivent par `changes` : NOTIFY de Postgres en
// production (room-events.ts), un émetteur en mémoire dans les tests.
import { eq } from "drizzle-orm";
import type { Db } from "../../db/client";
import { roomMembers } from "../../db/schema";
import { courseWords, textFingerprint } from "../rooms/course-words";
import { keepBonusText, keepProgress, leaveAfterDisconnect, readRoom, recordProgress, refreshRoom, RoomRefused, roomIdByCode, roomView, type Identity, type RoomView } from "../server/rooms";
import type { Player } from "./protocol";
import type { RaceCourse } from "./referee";

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
  /**
   * COURSE-06 : la course en cours, que le serveur arbitre ; null hors course. Absent (doubles de test, outils) :
   * la progression est relayée sans arbitrage.
   */
  course?(code: string): Promise<RaceCourse | null>;
  /** COURSE-06 : garde la progression validée d'un membre ; vrai si le salon a changé (arrivée, fin de course). */
  progress?(key: string, code: string, progress: number): Promise<boolean>;
  /** COURSE-07 : garde la dernière progression validée de ces coureurs (abandon, fin de course) pour la course partie à `startsAt`. */
  keep?(code: string, startsAt: number, rows: { key: string; progress: number }[]): Promise<void>;
  /**
   * BONUS-04 : garde le texte d'un coureur changé par un bonus (+3 / -3 mots) et sa progression recomptée sur ce texte,
   * pour la course partie à `startsAt` : le serveur redémarré et l'enregistrement de la course (POST /api/races) le relisent.
   */
  bonusText?(code: string, startsAt: number, key: string, words: string[], progress: number): Promise<void>;
};

/**
 * COURSE-06 : la course d'un salon lancé, vue par l'arbitre. Le texte est retiré comme le fait la page de course
 * (mêmes réglages, même graine, même passage : CONF-03), pour compter les caractères validés à chaque progression.
 */
export function raceCourseOf(view: RoomView): RaceCourse | null {
  if (view.status !== "racing" || view.startsAt === null) return null;
  const words = courseWords(view);
  let marks: number[] | null = null;
  if (words && view.textHash && textFingerprint(words) !== view.textHash) {
    // le site et le serveur temps réel ne retirent pas le même texte (versions différentes) : pas d'arbitrage des caractères
    console.error(`COURSE-06: text fingerprint mismatch in room ${view.code} (site ${view.textHash}, realtime ${textFingerprint(words)}): characters are not refereed, deploy the same version on both.`);
  } else if (words) {
    marks = [0];
    for (const word of words) marks.push(marks.at(-1)! + word.length + 1);
  }
  return {
    startsAt: view.startsAt,
    endsAt: view.endsAt,
    marks,
    runners: view.members.filter((m) => m.role === "player").map((m) => m.key),
    ...abandonedOf(view),
    // BONUS-02 : avec les bonus, le texte arbitré (le bonus +3 mots y puise) et la graine qui choisit leur type
    ...(view.settings.catchUpBonus ? { catchUpBonus: true, ...(marks && words ? { words } : {}), ...(view.seed !== null ? { seed: view.seed } : {}) } : {}),
  };
}

/** COURSE-07 : les coureurs qui ont abandonné, seulement s'il y en a. */
function abandonedOf(view: RoomView): { abandoned?: string[] } {
  const keys = view.members.filter((m) => m.abandoned).map((m) => m.key);
  return keys.length ? { abandoned: keys } : {};
}

const UUID =/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    async course(code) {
      const id = await roomIdByCode(db, code);
      if (id === null) return null;
      try {
        const course = raceCourseOf(await roomView(db, id));
        if (!course) return null;
        // COURSE-06 : la progression gardée en base, pour reprendre le classement après le départ de toutes les sockets
        // BONUS-04 : avec le texte changé par un bonus, sur lequel cette progression est comptée
        const rows = await db.select({ key: roomMembers.memberKey, progress: roomMembers.progress, finishedAt: roomMembers.finishedAt, words: roomMembers.bonusWords }).from(roomMembers).where(eq(roomMembers.roomId, id));
        return { ...course, resume: rows.map((r) => ({ key: r.key, progress: r.progress, finishedAt: r.finishedAt?.getTime() ?? null, ...(r.words?.length ? { words: r.words } : {}) })) };
      } catch (error) {
        return refused(error);
      }
    },
    progress: (key, code, progress) => recordProgress(db, code, key, progress),
    keep: (code, startsAt, rows) => keepProgress(db, code, startsAt, rows),
    bonusText: (code, startsAt, key, words, progress) => keepBonusText(db, code, startsAt, key, words, progress),
  };
}
