// COURSE-07 : abandonner la course, après confirmation. Le serveur enregistre l'abandon et gèle la progression
// (POST /api/rooms/:code/abandon) ; la page passe ensuite au podium, où le joueur figure avec le statut « abandon ».
import type { PlayerResult } from "../podium/results";
import { roomHrefOutsideRace } from "../room/room";
import type { RoomView } from "../../server/rooms";
import type { Race } from "./race";

/** idle : la course continue ; confirming : la question est posée ; sending : l'abandon part au serveur. */
export type AbandonStep = "idle" | "confirming" | "sending";
export type AbandonEvent = "ask" | "cancel" | "confirm" | "failed";

/** L'étape suivante. Rien ne part sans passer par la confirmation, et un double clic n'envoie qu'une fois. */
export function abandonStep(step: AbandonStep, event: AbandonEvent): AbandonStep {
  if (step === "idle" && event === "ask") return "confirming";
  if (step === "confirming" && event === "cancel") return "idle";
  if (step === "confirming" && event === "confirm") return "sending";
  if (step === "sending" && event === "failed") return "confirming";
  return step;
}

/** Le bouton n'apparaît qu'à un coureur (pas à un spectateur), pendant la course, tant qu'il n'est pas arrivé. */
export function canAbandon(race: Pick<Race, "phase" | "finishedAt">, watching: boolean): boolean {
  return !watching && race.phase === "racing" && !race.finishedAt;
}

/**
 * Où va la page de course : au podium si le serveur dit que ce membre a abandonné (même après un rechargement, même si
 * la salle est encore en course), sinon le détour habituel hors course (SALLE-09) ; null : la course s'affiche.
 */
export function raceExit(status: RoomView["status"], code: string, abandoned: boolean): string | null {
  return abandoned ? "/podium" : roomHrefOutsideRace(status, code);
}

export type DialogKey = { key: string; shift: boolean; focused: number; count: number; inside: boolean };
export type DialogAction = { type: "close" } | { type: "focus"; index: number } | { type: "block" } | { type: "pass" };

/**
 * Le clavier pendant la question. Échap ferme, où que soit le focus ; Tab et Maj+Tab tournent entre les `count`
 * boutons de la boîte (`focused` : celui qui a le focus, -1 hors de la boîte) ; hors de la boîte, toute autre touche est
 * bloquée, pour que la frappe ne fasse pas avancer la course ; dans la boîte, Entrée et Espace activent le bouton.
 */
export function dialogKey({ key, shift, focused, count, inside }: DialogKey): DialogAction {
  if (key === "Escape") return { type: "close" };
  if (key === "Tab") {
    if (focused < 0) return { type: "focus", index: shift ? count - 1 : 0 };
    return { type: "focus", index: (focused + (shift ? count - 1 : 1)) % count };
  }
  return inside ? { type: "pass" } : { type: "block" };
}

/** Demande l'abandon au serveur : null s'il l'a enregistré, sinon le code du refus (« network » hors ligne). */
export async function requestAbandon(code: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  try {
    const response = await fetcher(`/api/rooms/${code}/abandon`, { method: "POST", credentials: "same-origin" });
    if (response.ok) return null;
    const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
    return typeof body?.error === "string" ? body.error : "network";
  } catch {
    return "network";
  }
}

/** Mon résultat porte l'abandon (pas une arrivée) ; le serveur le vérifie de son côté à l'enregistrement. */
export function markAbandoned(players: PlayerResult[]): PlayerResult[] {
  return players.map((player) => (player.me ? { ...player, abandoned: true, finished: false } : player));
}
