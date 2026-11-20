// BONUS-02 : la page de course applique l'effet des bonus qui la ciblent, annoncés par le serveur (message `bonus`).
// Les types et leurs règles : src/rooms/bonus-effects.ts. Le texte changé est le mien seulement (`race.mine`) : les
// bots et les autres couloirs gardent celui de la course. BONUS-03 (annonce sur la piste) lira la même liste de bonus.
import type { ServerBonus } from "../../realtime/client";
import { editWords, wordsDone, type BonusEffect } from "../../rooms/bonus-effects";
import { myCourse, type Race } from "./race";
import { realtimeMemberKey, type RaceLanes } from "./track";

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

/**
 * BONUS-03 : les bonus annoncés après les `applied` premiers qui changent le texte d'un autre humain de la piste,
 * avec son couloir. La piste montre alors ce qui se passe : un meneur à +3 mots recule.
 */
export function remoteBonuses(bonuses: readonly ServerBonus[] | undefined, applied: number, lanes: RaceLanes, me: string | null): { lane: number; effect: BonusEffect }[] {
  return (bonuses ?? []).slice(applied).flatMap(({ effect }) => {
    if (!effect || effect.kind === "fog" || effect.target === me) return [];
    const key = realtimeMemberKey(effect.target);
    const lane = key === null ? -1 : lanes.keys.indexOf(key);
    return lane < 0 || lanes.players[lane]?.me ? [] : [{ lane, effect }];
  });
}

/**
 * BONUS-03 : le couloir d'un autre humain après un bonus sur son texte : mêmes mots validés, sur le nouveau nombre de
 * mots (comme le serveur, `bonusEffect`). Sa progression d'avant, relayée de nouveau, ne le refait pas avancer.
 */
export function applyRemoteBonus(race: Race, lane: number, effect: BonusEffect): Race {
  const remote = race.remotes.find((candidate) => candidate.lane === lane);
  if (!remote || remote.finishedAt || effect.kind === "fog") return race;
  const words = remote.words ?? race.course.words.length;
  const done = wordsDone(words, remote.progress);
  const next = editWords(Array.from({ length: words }, () => ""), effect, done).length;
  if (next === words || next === 0) return race;
  // un 2e bonus avant sa progression suivante garde la valeur relayée d'avant le 1er (c'est elle que le relais renvoie)
  const moved = { ...remote, words: next, progress: done / next, stale: remote.stale ?? remote.progress };
  return { ...race, remotes: race.remotes.map((candidate) => (candidate === remote ? moved : candidate)) };
}

/** Le brouillard est-il sur mes prochains mots ? */
export const fogged = (race: Race) => (race.fogUntil ?? 0) > race.now;
