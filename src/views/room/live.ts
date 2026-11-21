// TECH-06 : modèle d'affichage de la salle en temps réel (présence et progression), sans React.
// Les pages salle et course l'utilisent pour afficher l'état fourni par useRealtimeRoom.
import type { RealtimeState } from "../../realtime/client";

export type LiveParticipant = { id: string; name: string; me: boolean; percent: number };

const percentOf = (value: number | undefined) => (Number.isFinite(value) ? Math.round(Math.min(1, Math.max(0, value ?? 0)) * 100) : 0);

/** Les personnes présentes, dans l'ordre d'arrivée, avec leur progression en pourcentage. `mine` : la mienne, mesurée par la page. */
export function liveParticipants(state: RealtimeState | null, mine = 0): LiveParticipant[] {
  if (!state) return [];
  return state.players.map((player) => {
    const me = player.id === state.you?.id;
    return { id: player.id, name: player.name, me, percent: percentOf(me ? mine : state.progress[player.id]?.progress) };
  });
}

/** La clé de traduction de l'état de la connexion. */
export function liveStatusKey(state: RealtimeState | null) {
  return `room.live.status.${state?.status ?? "connecting"}` as const;
}
