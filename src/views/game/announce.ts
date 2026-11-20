// BONUS-03 : l'annonce d'un bonus, sur la piste (pour tous : quel bonus, sur quel couloir) et chez le joueur ciblé.
// Elle lit les bonus annoncés par le serveur (RealtimeState.bonuses), comme leur effet (src/views/game/bonus.ts).
// Un bonus sans effet (aucun type ne pouvait s'appliquer) ne change rien : il n'est pas annoncé.
import type { ServerBonus } from "../../realtime/client";
import type { BonusKind } from "../../rooms/bonus-effects";
import { realtimeMemberKey, type RaceLanes } from "./track";

/** Durée d'une annonce ; le brouillard reste annoncé tant qu'il dure. */
export const ANNOUNCE_MS = 4000;

export type BonusAnnouncement = {
  /** Unique dans la course : un joueur reçoit au plus un bonus par point de contrôle. */
  key: string;
  kind: BonusKind;
  /** Mots retirés ou ajoutés, ou secondes de brouillard. */
  count: number;
  /** Le couloir qui subit l'effet, et celui du joueur qui a reçu le bonus (-1 : hors piste). */
  lane: number;
  from: number;
  target: string;
  sender: string | null;
  /** L'effet me vise. */
  mine: boolean;
  /** Heure de fin de l'annonce (ms epoch). */
  until: number;
};

/** Le couloir d'un joueur temps réel, par sa clé de membre ; -1 s'il n'en a pas. */
function laneOf(id: string, lanes: RaceLanes): number {
  const key = realtimeMemberKey(id);
  return key === null ? -1 : lanes.keys.indexOf(key);
}

/** L'annonce d'un bonus reçu à `now`, ou null s'il ne change rien ou vise un joueur hors piste. `you` : mon id temps réel. */
export function announceBonus(bonus: ServerBonus, lanes: RaceLanes, you: string | null, now: number): BonusAnnouncement | null {
  const effect = bonus.effect;
  if (!effect) return null;
  const lane = laneOf(effect.target, lanes);
  if (lane < 0) return null;
  const from = laneOf(bonus.playerId, lanes);
  const count = effect.kind === "fog" ? Math.round(effect.durationMs / 1000) : effect.kind === "extra_words" ? effect.words.length : effect.removed;
  return {
    key: `${bonus.checkpoint}:${bonus.playerId}`,
    kind: effect.kind,
    count,
    lane,
    from,
    target: lanes.players[lane]!.name,
    sender: from < 0 ? null : lanes.players[from]!.name,
    mine: you !== null && effect.target === you,
    until: now + Math.max(ANNOUNCE_MS, effect.kind === "fog" ? effect.durationMs : 0),
  };
}

/** Les annonces des bonus reçus après les `seen` premiers. */
export function newAnnouncements(bonuses: readonly ServerBonus[] | undefined, seen: number, lanes: RaceLanes, you: string | null, now: number): BonusAnnouncement[] {
  return (bonuses ?? []).slice(seen).flatMap((bonus) => announceBonus(bonus, lanes, you, now) ?? []);
}

/** Les annonces encore affichées à `now`. */
export const activeAnnouncements = (list: readonly BonusAnnouncement[], now: number) => list.filter((a) => a.until > now);
