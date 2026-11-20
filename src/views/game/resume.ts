// COURSE-08 : reprendre la course après un rechargement de /game ou une coupure. Le texte (graine, passage) et l'horloge
// (startsAt, endsAt) viennent déjà du serveur ; la position, de la dernière progression qu'il a validée (classement du
// temps réel, src/realtime/referee.ts). La page ne fait qu'avancer jusqu'à elle : jamais en arrière, jamais plus loin.
import { countKey } from "../../players/keys";
import type { RealtimeState, RealtimeStatus } from "../../realtime/client";
import type { Race } from "./race";

/** Ma place selon le serveur : progression validée (0 à 1) et, si j'étais arrivé, le temps de mon arrivée depuis le départ. */
export type ServerStanding = { progress: number; finishedMs: number | null };

/** Ma ligne du dernier classement du serveur, par mon identifiant temps réel ; null tant qu'il n'en a rien dit. */
export function myStanding(live: RealtimeState | null): ServerStanding | null {
  const id = live?.you?.id;
  const mine = id ? live?.race?.standings.find((standing) => standing.playerId === id) : undefined;
  return mine ? { progress: mine.progress, finishedMs: mine.finishedMs } : null;
}

/**
 * La course reprise au mot que le serveur a validé (mots validés = progression × nombre de mots, comme l'arbitre).
 * Les mots sautés comptent comme tapés justes (le serveur ne garde pas les fautes) : la vitesse compte depuis le départ
 * du serveur, la précision reste cohérente. Sans effet hors course, ou si la page est déjà au moins aussi loin.
 */
export function resumeRace(race: Race, standing: ServerStanding, startsAt: number): Race {
  if (race.phase !== "racing" || race.finishedAt || race.myLane < 0) return race;
  const { words, marks } = race.course;
  const progress = Number.isFinite(standing.progress) ? Math.min(1, Math.max(0, standing.progress)) : 0;
  const target = Math.round(progress * words.length);
  if (target <= race.wordIndex) return race;
  const text = words.join(" ") + " ";
  let keys = race.keys;
  for (let k = marks[race.wordIndex]!; k < marks[target]! && k < text.length; k++) keys = countKey(keys, text[k]!, false);
  const resumed: Race = { ...race, wordIndex: target, typed: "", keystrokes: race.keystrokes + marks[target]! - marks[race.wordIndex]!, keys };
  if (target < words.length) return resumed;
  const finishedAt = standing.finishedMs === null ? race.now : startsAt + standing.finishedMs;
  return { ...resumed, finishedAt, arrivals: race.arrivals.includes(race.myLane) ? race.arrivals : [...race.arrivals, race.myLane] };
}

/** « Reprise de la course… » : la page est arrivée en pleine course et attend sa place du serveur temps réel. */
export function resumeNotice({ arrivedMidRace, resumed, racing, status }: { arrivedMidRace: boolean; resumed: boolean; racing: boolean; status: RealtimeStatus | undefined }): boolean {
  return arrivedMidRace && racing && !resumed && (status === undefined || status === "connecting" || status === "open" || status === "reconnecting");
}
