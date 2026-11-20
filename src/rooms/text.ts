// CONF-03 : le nombre de mots d'une course selon sa longueur, partagé par le tirage du serveur et la page de course.
import type { RoomSettings } from "./settings";

const WORD_TARGETS = { "very-short": 10, short: 25, medium: 50, long: 100 } as const;

export function wordTarget(settings: Pick<RoomSettings, "length" | "wordCount">): number {
  return settings.length === "other" ? settings.wordCount : WORD_TARGETS[settings.length];
}

/**
 * CONF-03 : générateur à graine (mulberry32). La graine est tirée par le serveur au lancement (rooms.text_seed) :
 * chaque membre du salon tire les mêmes mots, donc tape le même texte.
 */
export function seededRandom(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
