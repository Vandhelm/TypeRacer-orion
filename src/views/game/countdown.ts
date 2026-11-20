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

/** Au-delà, une mesure est trop vieille pour rester la meilleure (dérive des horloges, autre réseau). */
export const SAMPLE_MAX_AGE_MS = 10 * 60_000;
const STORAGE_KEY = "orion.clock";
type Sample = { offset: number; rtt: number; at: number };
type SampleStorage = Pick<Storage, "getItem" | "setItem">;

function stored(storage: SampleStorage | null): Sample | null {
  try {
    const value = JSON.parse(storage?.getItem(STORAGE_KEY) ?? "null") as Partial<Sample> | null;
    if (!value || ![value.offset, value.rtt, value.at].every((n) => typeof n === "number" && Number.isFinite(n))) return null;
    return value as Sample;
  } catch {
    return null;
  }
}

/**
 * COURSE-03 : le filtre des mesures. L'erreur d'une mesure est au plus la moitié de son aller-retour : on garde celle
 * dont l'aller-retour est le plus court (une réponse lente isolée ne déplace rien), tant qu'elle a moins de
 * SAMPLE_MAX_AGE_MS. Elle est gardée en sessionStorage : celle prise au salon sert encore sur /game (rechargement).
 */
export function createClockSync(storage: SampleStorage | null, now: () => number = Date.now) {
  let best = stored(storage);
  if (best && now() - best.at > SAMPLE_MAX_AGE_MS) best = null;
  return {
    /** Ajoute la mesure d'une requête (heures locales d'envoi et de réception, heure du serveur) ; renvoie le décalage retenu. */
    add(sentAt: number, receivedAt: number, serverNow: number): number {
      const sample = { offset: clockOffset(sentAt, receivedAt, serverNow), rtt: Math.max(0, receivedAt - sentAt), at: receivedAt };
      if (!best || sample.rtt <= best.rtt || sample.at - best.at > SAMPLE_MAX_AGE_MS) {
        best = sample;
        try {
          storage?.setItem(STORAGE_KEY, JSON.stringify(best));
        } catch {
          // stockage plein ou interdit : la mesure reste en mémoire
        }
      }
      return best.offset;
    },
    /** Le décalage retenu ; 0 sans mesure. */
    offset: () => best?.offset ?? 0,
  };
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
