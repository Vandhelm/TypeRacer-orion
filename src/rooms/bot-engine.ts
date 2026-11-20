// BOT-05 : le moteur des bots, pur et déterministe à partir d'une graine. Partagé par la page de course (affichage,
// src/views/game/race.ts) et le serveur (fin de course et classement, src/server/bot-course.ts) : avec la graine du
// salon (rooms.text_seed), le même texte et le même bot, tous calculent la même trajectoire. Aucun Math.random ni
// Date.now ici : le temps est donné en ticks de BOT_TICK_MS depuis le départ.
import type { RoomSettings } from "./settings";
import { seededRandom } from "./text";

export const BOT_TICK_MS = 200;
const CHARS_PER_WORD = 5;
/** Au-delà de 24 h de course, un bot n'avance plus : garde-fou de la simulation sans limite de temps. */
const MAX_TICKS = (24 * 3600 * 1000) / BOT_TICK_MS;

export const BOT_WPM: Record<RoomSettings["botSpeed"], [number, number]> = { slow: [25, 40], medium: [40, 65], fast: [65, 100], mixed: [25, 100] };
/** Part des frappes justes, en %. Une faute est retapée : elle coûte du temps de frappe, pas de la vitesse nette. */
export const BOT_ACCURACY: Record<RoomSettings["botAccuracy"], [number, number]> = { shaky: [82, 90], decent: [90, 96], high: [96, 100] };

/** La graine d'un bot dans une course : celle de la course mêlée à son nom (sans la casse), FNV-1a. */
export function botSeed(raceSeed: number, name: string): number {
  let hash = 0x811c9dc5 ^ raceSeed;
  for (const char of name.toLowerCase()) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}

/** Vitesse (MPM) et précision (%) d'un bot, tirées de sa graine dans les plages de son niveau. */
export function botProfile(seed: number, level: RoomSettings["botSpeed"], accuracy: RoomSettings["botAccuracy"]): { wpm: number; accuracy: number } {
  const random = seededRandom(seed);
  const [low, high] = BOT_WPM[level];
  const [worst, best] = BOT_ACCURACY[accuracy];
  return { wpm: Math.round(low + random() * (high - low)), accuracy: worst + random() * (best - worst) };
}

/** L'aléa du tick `tick` (à partir de 1) d'un bot, entre 0 et 1 : ne dépend que de sa graine et du tick. */
export function botJitter(seed: number, tick: number): number {
  return seededRandom(seed ^ Math.imul(tick, 0x9e3779b1))();
}

/**
 * Un tick : la position (en mots, fractionnaire) après BOT_TICK_MS. Un bot tape à vitesse constante en caractères :
 * les longs mots lui prennent plus de temps ; `jitter` fait varier son rythme de 55 % à 145 %.
 */
export function botStep(words: readonly string[], position: number, wpm: number, jitter: number): number {
  const current = words[Math.floor(position)] ?? "";
  const pace = ((wpm * CHARS_PER_WORD) / 60 / (current.length + 1)) * (BOT_TICK_MS / 1000);
  return Math.min(words.length, position + pace * (0.55 + jitter * 0.9));
}

export type BotRun = { position: number; progress: number; arrivedMs: number | null };

/**
 * La course d'un bot `elapsedMs` après le départ : sa position, sa part du texte (0 à 1) et son arrivée (ms depuis le
 * départ, un nombre entier de ticks ; null s'il n'est pas encore arrivé). Une course limitée l'arrête à sa durée.
 */
export function simulateBot(course: { words: readonly string[]; durationMs: number | null }, bot: { seed: number; wpm: number }, elapsedMs: number): BotRun {
  const { words, durationMs } = course;
  const until = Math.min(elapsedMs, durationMs ?? Infinity);
  const ticks = Number.isNaN(until) ? 0 : Math.min(MAX_TICKS, Math.max(0, Math.floor(until / BOT_TICK_MS)));
  if (!words.length) return { position: 0, progress: 1, arrivedMs: 0 };
  let position = 0;
  for (let tick = 1; tick <= ticks; tick++) {
    position = botStep(words, position, bot.wpm, botJitter(bot.seed, tick));
    if (position >= words.length) return { position, progress: 1, arrivedMs: tick * BOT_TICK_MS };
  }
  return { position, progress: position / words.length, arrivedMs: null };
}
