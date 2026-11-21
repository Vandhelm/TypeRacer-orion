// BONUS-01 : l'attribution des bonus de remontée, décidée par le serveur. Logique pure, sans socket ni base.
// Règle (documentée dans docs/ARCHITECTURE.md, « Bonus de remontée ») :
// - points de contrôle : le meneur (la plus haute progression) atteint 25 %, 50 % puis 75 % du texte ; chacun ne sert
//   qu'une fois par course, même si le meneur change ou en franchit plusieurs d'un coup ;
// - en retard, au moment où le point est franchi : tout coureur pas encore arrivé, moins avancé que le meneur, qui est
//   en dernière position (ex æquo compris) ou à strictement plus de 25 points de progression derrière lui ;
// - chaque coureur en retard reçoit un bonus par point de contrôle, au plus 3 par course.
// L'effet du bonus (BONUS-02) et son annonce (BONUS-03) se branchent sur les attributions renvoyées ici.

import type { BonusKind } from "./bonus-effects";

/** Les points de contrôle, en progression du meneur (annexe A : caractères validés ÷ longueur du texte). */
export const CHECKPOINTS = [0.25, 0.5, 0.75] as const;
/** Au-delà de cet écart de progression avec le meneur (strictement), un coureur est en retard. */
export const BEHIND_GAP = 0.25;
/** Le nombre maximal de bonus reçus par un coureur dans une course. */
export const MAX_BONUSES = 3;

/** Un coureur vu par l'attribution : sa progression acceptée par le serveur, et s'il est arrivé. */
export type BonusRunner = { playerId: string; progress: number; finished: boolean };
/** L'état des bonus d'une course : points de contrôle déjà franchis, et bonus reçus par coureur. */
export type BonusTally = { checkpoints: number; received: Map<string, number> };
/** Un bonus attribué : à qui, à quel point de contrôle (1 à 3), et son total de bonus dans la course après celui-ci. */
export type BonusAward = { playerId: string; checkpoint: number; count: number };

/** RES-02 / HIST-02 : les bonus reçus par un coureur dans une course (au plus MAX_BONUSES) et leurs types connus (BONUS-02). */
export type ReceivedBonuses = { count: number; kinds: BonusKind[] };

/** HIST-02 : les bonus reçus, d'après la liste de leurs types gardée par le serveur (null : un bonus sans effet). */
export function receivedOf(kinds: readonly (BonusKind | null)[]): ReceivedBonuses {
  const kept = kinds.slice(0, MAX_BONUSES);
  return { count: kept.length, kinds: kept.filter((kind): kind is BonusKind => kind !== null) };
}

export const newTally = (): BonusTally => ({ checkpoints: 0, received: new Map() });

/** Une progression bornée à [0, 1] ; une valeur absurde (NaN) compte pour 0. */
const clamp = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : value === Infinity ? 1 : 0);

const leaderOf = (runners: readonly BonusRunner[]) => runners.reduce((max, runner) => Math.max(max, clamp(runner.progress)), 0);

/** Les coureurs en retard maintenant : dernière position ou plus de BEHIND_GAP derrière le meneur, jamais un arrivé. */
export function behindRunners(runners: readonly BonusRunner[]): string[] {
  if (runners.length < 2) return [];
  const leader = leaderOf(runners);
  const typing = runners.filter((runner) => !runner.finished && clamp(runner.progress) < leader);
  if (!typing.length) return [];
  const last = Math.min(...typing.map((runner) => clamp(runner.progress)));
  return typing.filter((runner) => clamp(runner.progress) === last || leader - clamp(runner.progress) > BEHIND_GAP).map((runner) => runner.playerId);
}

/** Le nombre de points de contrôle atteints par le meneur. */
const reached = (runners: readonly BonusRunner[]) => {
  const leader = leaderOf(runners);
  return CHECKPOINTS.filter((checkpoint) => leader >= checkpoint).length;
};

/**
 * Franchit les points de contrôle que le meneur vient d'atteindre et renvoie les bonus attribués, dans l'ordre.
 * Modifie `tally`. À appeler après chaque progression acceptée.
 */
export function awardBonuses(tally: BonusTally, runners: readonly BonusRunner[]): BonusAward[] {
  const target = reached(runners);
  const awards: BonusAward[] = [];
  while (tally.checkpoints < target) {
    tally.checkpoints += 1;
    for (const playerId of behindRunners(runners)) {
      const count = tally.received.get(playerId) ?? 0;
      if (count >= MAX_BONUSES) continue;
      tally.received.set(playerId, count + 1);
      awards.push({ playerId, checkpoint: tally.checkpoints, count: count + 1 });
    }
  }
  return awards;
}

/** Course reprise (serveur redémarré) : les points déjà franchis le restent, sans nouveau bonus. */
export function skipPassed(tally: BonusTally, runners: readonly BonusRunner[]): void {
  tally.checkpoints = Math.max(tally.checkpoints, reached(runners));
}
