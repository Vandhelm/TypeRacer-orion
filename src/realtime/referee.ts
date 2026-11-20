// COURSE-06 : l'arbitre de la course, côté serveur temps réel. Logique pure, sans socket ni base.
// Le serveur garde la dernière progression acceptée de chaque coureur et la juge avant de la diffuser :
// - pas avant le départ serveur (launched_at + décompte), pas après la fin (départ + durée) ;
// - jamais en recul ;
// - pas plus de caractères depuis le départ que ne peut taper un humain (vitesse irréaliste) ;
// - pas plus de caractères entre deux messages que ne peut taper un humain depuis le dernier accepté (saut).
// Les caractères sont comptés par le serveur sur le texte qu'il a tiré (CONF-03), espaces comprises (annexe A),
// jamais déclarés par le client. Les seuils sont documentés dans docs/ARCHITECTURE.md.

/** Au-delà de 300 MPM soutenus (record humain autour de 300 en pointe), une progression est irréaliste. */
export const MAX_HUMAN_WPM = 300;
/** 300 MPM = 300 × 5 caractères par minute = 25 caractères par seconde. */
export const MAX_CHARS_PER_SECOND = (MAX_HUMAN_WPM * 5) / 60;
/** Marge en caractères : deux mots validés qui arrivent dans le même paquet réseau. */
export const SLACK_CHARS = 40;
/** Écart toléré entre l'horloge de la base (launched_at) et celle du serveur temps réel. */
export const CLOCK_TOLERANCE_MS = 1000;

/**
 * La course telle que le serveur la connaît. `marks[i]` : caractères validés après i mots (createCourse), null si
 * le texte n'est pas connu (salon lancé sans graine). `runners` : clés des membres participants (pas les spectateurs).
 */
export type RaceCourse = { startsAt: number; endsAt: number | null; marks: number[] | null; runners: string[] };
/** La dernière progression acceptée d'un coureur ; `finishedAt` : heure serveur de son arrivée. */
export type Accepted = { progress: number; chars: number; wpm: number; at: number; finishedAt: number | null };
export type Refusal = "race_not_started" | "race_over" | "progress_backward" | "progress_jump" | "progress_too_fast";
export type Verdict = { ok: true; entry: Accepted } | { ok: false; reason: Refusal };

/** Les caractères validés à cette progression (mots validés ÷ nombre de mots, comme la page de course). */
export function charsAt(marks: number[], progress: number): number {
  const words = marks.length - 1;
  return marks[Math.min(words, Math.max(0, Math.round(progress * words)))]!;
}

/** Ce qu'un humain peut taper en `ms` millisecondes, marge comprise. */
const humanChars = (ms: number) => (MAX_CHARS_PER_SECOND * Math.max(0, ms)) / 1000 + SLACK_CHARS;

export function judge(course: RaceCourse, previous: Accepted | undefined, progress: number, wpm: number, now: number): Verdict {
  if (now < course.startsAt - CLOCK_TOLERANCE_MS) return { ok: false, reason: "race_not_started" };
  if (course.endsAt !== null && now > course.endsAt + CLOCK_TOLERANCE_MS) return { ok: false, reason: "race_over" };
  if (previous && progress < previous.progress) return { ok: false, reason: "progress_backward" };
  const chars = course.marks ? charsAt(course.marks, progress) : 0;
  if (course.marks) {
    if (chars > humanChars(now - course.startsAt + CLOCK_TOLERANCE_MS)) return { ok: false, reason: "progress_too_fast" };
    if (previous && chars - previous.chars > humanChars(now - previous.at)) return { ok: false, reason: "progress_jump" };
  }
  const finishedAt = previous?.finishedAt ?? (progress >= 1 ? now : null);
  return { ok: true, entry: { progress, chars, wpm, at: now, finishedAt } };
}

export type Standing = { playerId: string; rank: number; progress: number; wpm: number; finishedMs: number | null };

/** COURSE-06 / COURSE-10 : d'abord les arrivés par heure d'arrivée, puis les autres par progression. */
export function standings(entries: Map<string, Accepted>, startsAt: number): Standing[] {
  return [...entries]
    .sort(([idA, a], [idB, b]) => {
      if (a.finishedAt !== null && b.finishedAt !== null) return a.finishedAt - b.finishedAt;
      if (a.finishedAt !== null) return -1;
      if (b.finishedAt !== null) return 1;
      return b.progress - a.progress || idA.localeCompare(idB);
    })
    .map(([playerId, entry], index) => ({ playerId, rank: index + 1, progress: entry.progress, wpm: entry.wpm, finishedMs: entry.finishedAt === null ? null : entry.finishedAt - startsAt }));
}
