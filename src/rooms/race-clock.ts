// COURSE-06 : le départ et la fin d'une course, décidés par le serveur depuis rooms.launched_at (horloge de la base).
// Partagé par la vue du salon (src/server/rooms.ts), le serveur temps réel et l'enregistrement des courses.

/** COURSE-03 : le décompte (3, 2, 1) entre le lancement et le départ. */
export const COUNTDOWN_MS = 3000;

/** Le départ (lancement + décompte) et la fin (départ + durée, null sans limite), en ms epoch ; null avant tout lancement. */
export function raceClock(launchedAt: Date | null, durationSeconds: number | null): { startsAt: number | null; endsAt: number | null } {
  if (!launchedAt) return { startsAt: null, endsAt: null };
  const startsAt = launchedAt.getTime() + COUNTDOWN_MS;
  return { startsAt, endsAt: durationSeconds === null ? null : startsAt + durationSeconds * 1000 };
}
