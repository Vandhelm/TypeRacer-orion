// COURSE-11 : après la course, le podium suit son salon. L'hôte relance (par le salon, réglages ouverts) ou ferme la salle ;
// les autres attendent, puis rejoignent la course relancée, ou repartent à l'accueil si la salle est fermée.
import type { Answer } from "../room/api";

/** COURSE-10 : les membres dont le serveur a noté l'abandon (members[].abandoned), par nom ; aucun sans réponse. */
export function abandonedNames(reply: Answer): string[] {
  return reply.ok ? reply.result.room.members.filter((m) => m.abandoned).map((m) => m.name) : [];
}

/** L'accueil, avec le message « la salle a été fermée ». */
export const ROOM_CLOSED_HREF = "/home?roomClosed=1";
const PARAM = "roomClosed";

/** Ce que le podium fait d'une relecture du salon. host : dit par le serveur (null tant qu'il n'a pas répondu). */
export type AfterRace = { host: boolean | null; ended: boolean; go: string | null };

/**
 * ended : on a déjà vu la course finie (salon aux résultats, ou soi-même fini). Seule une course relancée après coup
 * renvoie à /game : la première course encore en cours (d'autres tapent) ne le fait pas.
 * Un salon introuvable ou fermé, pour un membre qui y était : l'hôte l'a fermé.
 */
export function afterRace(reply: Answer, ended: boolean): AfterRace {
  if (!reply.ok) return { host: null, ended, go: reply.error === "not_found" || reply.error === "closed" ? ROOM_CLOSED_HREF : null };
  const { room, you } = reply.result;
  const finished = room.members.find((m) => m.key === you)?.finished ?? false;
  const racing = room.status === "racing";
  return { host: room.host === you, ended: ended || !racing || finished, go: racing && !finished && ended ? `/game?code=${room.code}` : null };
}

/** L'accueil : le message est-il à montrer, et l'adresse sans le paramètre. */
export function takeRoomClosed(search: string): { closed: boolean; search: string } {
  const params = new URLSearchParams(search);
  const closed = params.has(PARAM);
  params.delete(PARAM);
  return { closed, search: params.size ? `?${params}` : "" };
}
