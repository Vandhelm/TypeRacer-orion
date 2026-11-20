// COURSE-08 : les délais de la reprise, partagés par le serveur (src/server/rooms.ts) et la page de course
// (src/views/room/presence.ts). Voir docs/ARCHITECTURE.md, « Déconnexion et reprise ».

/** Un coureur qui revient dans ce délai après sa coupure reprend sa course ; au-delà, il a abandonné. */
export const RECONNECT_MS = 30_000;
/** Sur /game, la page relit le salon à ce rythme : son dernier signe de vie précède sa coupure d'au plus ce délai. */
export const RACE_PRESENCE_MS = 5_000;
/**
 * Le serveur ne voit pas la coupure, seulement le dernier signe de vie (last_seen_at). Pour garantir 30 s depuis la
 * coupure, il attend 30 s plus l'intervalle de présence : un coureur est noté abandonné entre 30 et 35 s après sa coupure
 * (plus le balayage, 5 s au plus), jamais avant 30 s.
 */
export const ABANDON_AFTER_MS = RECONNECT_MS + RACE_PRESENCE_MS;
