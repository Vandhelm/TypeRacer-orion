// COURSE-07 : abandonner la course, après confirmation. Le serveur enregistre l'abandon et gèle la progression
// (POST /api/rooms/:code/abandon) ; la page passe ensuite au podium, où le joueur figure avec le statut « abandon ».
import type { PlayerResult } from "../podium/results";
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
