// COURSE-06 / CONF-03 : les mots d'une course lancée, retirés comme la page de course (mêmes réglages, même graine,
// même passage), et leur empreinte. Le site l'enregistre au lancement (rooms.text_hash) ; le serveur temps réel la
// recalcule avec son propre code : une autre empreinte veut dire que les deux ne sont pas à la même version.
import { buildWords, type CourseSettings } from "../views/game/course";
import { seededRandom } from "./text";

/** settings : les réglages du texte (ceux d'un salon, ou une ligne race_configs avec son texte personnalisé). */
export type DrawnCourse = { settings: CourseSettings; seed: number | null; passage: { body: string } | null };

/** Les mots de la course, ou null sans graine (salon lancé avant CONF-03). */
export function courseWords(course: DrawnCourse): string[] | null {
  return course.seed === null ? null : buildWords(course.settings, seededRandom(course.seed), course.passage?.body ?? null);
}

/** Empreinte FNV-1a 32 bits des mots séparés par une espace, en 8 chiffres hexadécimaux. */
export function textFingerprint(words: string[]): string {
  let hash = 0x811c9dc5;
  for (const char of words.join(" ")) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
