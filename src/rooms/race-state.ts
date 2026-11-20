// COURSE-01 : la machine à états d'un salon, documentée dans docs/ARCHITECTURE.md (« Machine à états d'une course »).
// Partagée par le serveur (src/server/rooms.ts, seule écriture du statut) et le client (phases de src/views/game/race.ts).
import type { RoomStatus } from "./access";

/** Les états de COURSE-01. Le décompte n'est pas stocké : rooms.status vaut « racing » et l'horloge tranche (raceState). */
export const RACE_STATES = ["waiting", "countdown", "racing", "results", "closed"] as const;
export type RaceState = (typeof RACE_STATES)[number];

/** Le nom de chaque état dans l'énoncé (docs/criteres.md, COURSE-01). */
export const STATE_NAMES: Record<RaceState, string> = { waiting: "EN_ATTENTE", countdown: "DÉCOMPTE", racing: "EN_COURSE", results: "RÉSULTATS", closed: "FERMÉE" };

/**
 * Ce qui fait changer d'état :
 * - launch : l'hôte lance (COURSE-02) ; start : le décompte est écoulé (COURSE-03) ; finish : tout le monde a fini ou
 *   l'échéance est passée (SALLE-09) ; reopen : retour au salon après les résultats ; close : l'hôte ferme (COURSE-11) ;
 * - abandon : plus aucun humain pour être hôte (SALLE-08). Seule entorse au schéma : un salon vide ferme dans tout état.
 */
export const RACE_EVENTS = ["launch", "start", "finish", "reopen", "close", "abandon"] as const;
export type RaceEvent = (typeof RACE_EVENTS)[number];

const TRANSITIONS: Record<RaceEvent, { from: readonly RaceState[]; to: RaceState }> = {
  launch: { from: ["waiting"], to: "countdown" },
  start: { from: ["countdown"], to: "racing" },
  finish: { from: ["racing"], to: "results" },
  reopen: { from: ["results"], to: "waiting" },
  close: { from: ["results"], to: "closed" },
  abandon: { from: ["waiting", "countdown", "racing", "results"], to: "closed" },
};

/** COURSE-03 : le décompte (3, 2, 1) entre le lancement et le départ. Même valeur que race-clock.ts (COURSE-06). */
export const COUNTDOWN_MS = 3000;

/** Une transition hors du schéma. */
export class InvalidTransition extends Error {
  constructor(
    readonly from: RaceState,
    readonly event: RaceEvent,
  ) {
    super(`invalid transition: ${String(event)} from ${String(from)}`);
  }
}

/** COURSE-01 : l'état après `event`, ou InvalidTransition si le schéma ne le permet pas. */
export function transition(from: RaceState, event: RaceEvent): RaceState {
  const rule = Object.hasOwn(TRANSITIONS, event) ? TRANSITIONS[event] : undefined;
  if (!rule || !rule.from.includes(from)) throw new InvalidTransition(from, event);
  return rule.to;
}

/** Plusieurs transitions de suite (ex. relance : results → waiting → countdown) ; refusé si une étape l'est. */
export function follow(from: RaceState, events: readonly RaceEvent[]): RaceState {
  return events.reduce(transition, from);
}

/** L'état d'un salon : son statut stocké, et pour « racing » le temps écoulé depuis le lancement (ms, horloge de la base). */
export function raceState(status: RoomStatus, sinceLaunchMs: number | null): RaceState {
  if (status === "racing" && sinceLaunchMs !== null && sinceLaunchMs < COUNTDOWN_MS) return "countdown";
  return status;
}

/** Le statut à écrire en base pour un état : le décompte s'écrit « racing » (avec launched_at). */
export function storedStatus(state: RaceState): RoomStatus {
  return state === "countdown" ? "racing" : state;
}
