// BONUS-02 : la page de course applique l'effet des bonus qui la ciblent, annoncés par le serveur (message `bonus`).
// Les types et leurs règles : src/rooms/bonus-effects.ts. Le texte changé est le mien seulement (`race.mine`) : les
// bots et les autres couloirs gardent celui de la course. BONUS-03 (annonce sur la piste) lira la même liste de bonus.
import type { ServerBonus } from "../../realtime/client";
import { editWords, type BonusEffect } from "../../rooms/bonus-effects";
import { myCourse, type Race } from "./race";

/** Les effets à appliquer ici : ceux des bonus annoncés après les `applied` premiers, qui ciblent `me`. */
export function bonusesFor(bonuses: readonly ServerBonus[] | undefined, applied: number, me: string | null): BonusEffect[] {
  if (!me || !bonuses) return [];
  return bonuses.slice(applied).flatMap((bonus) => (bonus.effect?.target === me ? [bonus.effect] : []));
}

/** Mon texte après l'effet (+3 / -3 mots), ou le brouillard jusqu'à `now + durationMs`. Sans effet hors course ou une fois arrivé. */
export function applyBonus(race: Race, effect: BonusEffect, now: number): Race {
  if (race.phase !== "racing" || race.finishedAt) return race;
  if (effect.kind === "fog") return { ...race, fogUntil: Math.max(race.fogUntil ?? 0, now + effect.durationMs) };
  const course = myCourse(race);
  const words = editWords(course.words, effect, race.wordIndex);
  if (words.length === course.words.length) return race;
  const marks = [0];
  words.forEach((word, i) => marks.push(marks[i]! + word.length + 1));
  return { ...race, mine: { ...course, words, marks } };
}

/** Le brouillard est-il sur mes prochains mots ? */
export const fogged = (race: Race) => (race.fogUntil ?? 0) > race.now;
