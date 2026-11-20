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

/** Ce que la page suit (useBonusAnnouncements) : combien de bonus reçus sont déjà lus, et les annonces affichées. */
export type AnnouncementFeed = { seen: number; list: BonusAnnouncement[] };
export const EMPTY_FEED: AnnouncementFeed = { seen: 0, list: [] };

/** Le fil après une nouvelle liste de bonus reçus ; une liste plus courte vient d'une connexion neuve : elle est relue du début. */
export function feedBonuses(feed: AnnouncementFeed, bonuses: readonly ServerBonus[] | undefined, lanes: RaceLanes, you: string | null, now: number): AnnouncementFeed {
  const count = bonuses?.length ?? 0;
  if (count === feed.seen) return feed;
  const from = count < feed.seen ? 0 : feed.seen;
  return { seen: count, list: mergeAnnouncements(feed.list, newAnnouncements(bonuses, from, lanes, you, now), now) };
}

/** Le fil sans les annonces finies à `now` (le même s'il n'y en a pas). */
export function expireAnnouncements(feed: AnnouncementFeed, now: number): AnnouncementFeed {
  const list = activeAnnouncements(feed.list, now);
  return list.length === feed.list.length ? feed : { ...feed, list };
}

/** L'heure où la prochaine annonce finit, ou null. */
export const nextExpiry = (list: readonly BonusAnnouncement[]) => (list.length ? Math.min(...list.map((a) => a.until)) : null);

/** Les annonces encore affichées, puis les nouvelles ; un bonus déjà annoncé (même clé) ne l'est pas deux fois. */
export function mergeAnnouncements(previous: readonly BonusAnnouncement[], fresh: readonly BonusAnnouncement[], now: number): BonusAnnouncement[] {
  const shown = new Set(previous.map((a) => a.key));
  return [...activeAnnouncements(previous, now), ...fresh.filter((a) => !shown.has(a.key))];
}
