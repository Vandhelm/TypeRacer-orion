// COURSE-03 : le décompte synchronisé (3, 2, 1) calé sur le départ du serveur (startsAt, COURSE-06).
//
// Décalage d'horloge : la vue du salon donne `serverNow`, l'heure de la base au moment de la lecture (même horloge que
// startsAt). Le navigateur note l'heure locale à l'envoi et à la réception de la requête ; la lecture a eu lieu vers le
// milieu de l'aller-retour, d'où décalage = serverNow − (envoi + réception) / 2 (algorithme de Cristian). L'erreur est au
// plus la moitié de l'aller-retour (typiquement quelques dizaines de ms) : les membres partent ensemble à ~100 ms près.
// Toute la course compte ensuite en heure du serveur : maintenant = Date.now() + décalage.

/** Le temps où « partez » reste affiché après le départ. */
export const GO_MS = 500;
const STEP_MS = 1000;

/** Le décalage (ms) à ajouter à l'heure locale pour obtenir celle du serveur. */
export function clockOffset(sentAt: number, receivedAt: number, serverNow: number): number {
  return serverNow - (sentAt + receivedAt) / 2;
}

/**
 * Le chiffre affiché à l'heure serveur `now` : 3, 2, 1 (une seconde chacun) avant `startsAt`, 0 (« partez ») pendant
 * GO_MS après, puis rien. `started` : la frappe est ouverte (dès startsAt).
 */
export function countdownAt(startsAt: number, now: number): { count: number | null; started: boolean } {
  const left = startsAt - now;
  if (left > 0) return { count: Math.min(3, Math.ceil(left / STEP_MS)), started: false };
  return { count: -left < GO_MS ? 0 : null, started: true };
}

/** Dans combien de ms (heure serveur) le chiffre change ; null quand le décompte est terminé. */
export function nextChangeIn(startsAt: number, now: number): number | null {
  const left = startsAt - now;
  if (left > 3 * STEP_MS) return left - 3 * STEP_MS;
  if (left > 0) return left % STEP_MS || STEP_MS;
  return -left < GO_MS ? GO_MS + left : null;
}

/** COURSE-03 : la durée de la course est celle du serveur (endsAt − startsAt) ; sans départ du serveur, celle du salon. */
export function raceDurationSeconds(startsAt: number | null, endsAt: number | null, roomSeconds: number | null): number | null {
  if (startsAt === null) return roomSeconds;
  return endsAt === null ? null : (endsAt - startsAt) / 1000;
}
