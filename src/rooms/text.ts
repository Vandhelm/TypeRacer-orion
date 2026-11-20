// CONF-03 : le nombre de mots d'une course selon sa longueur, partagé par le tirage du serveur et la page de course.
import type { RoomSettings } from "./settings";

const WORD_TARGETS = { "very-short": 10, short: 25, medium: 50, long: 100 } as const;

export function wordTarget(settings: Pick<RoomSettings, "length" | "wordCount">): number {
  return settings.length === "other" ? settings.wordCount : WORD_TARGETS[settings.length];
}
