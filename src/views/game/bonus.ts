// BONUS-02 : la page de course applique l'effet des bonus qui la ciblent, annoncés par le serveur (message `bonus`).
// Les types et leurs règles : src/rooms/bonus-effects.ts. Le texte changé est le mien seulement (`race.mine`) : les
// bots et les autres couloirs gardent celui de la course. BONUS-03 (annonce sur la piste) lira la même liste de bonus.
// BOT-04 : un effet sur un bot (`bot:<nom>`, daté par le serveur) est rejoué par le moteur dans son couloir (replayBot).
import type { ServerBonus } from "../../realtime/client";
import type { BotBonus } from "../../rooms/bot-engine";
import { editWords, wordsDone, type BonusEffect } from "../../rooms/bonus-effects";
import { botNameOf } from "../../rooms/bots";
import { createCourse, myCourse, replayBot, type Race } from "./race";
import { laneOfRunner, realtimeMemberKey, type RaceLanes } from "./track";

/** BOT-04 : les effets datés des bonus annoncés après les `applied` premiers qui visent un bot de la piste, avec son couloir. */
export function botBonusesFor(bonuses: readonly ServerBonus[] | undefined, applied: number, lanes: RaceLanes): { lane: number; bonus: BotBonus }[] {
  return (bonuses ?? []).slice(applied).flatMap(({ effect, at, seq }) => {
    if (!effect || at === undefined || botNameOf(effect.target) === null) return [];
    const lane = laneOfRunner(effect.target, lanes);
    return lane < 0 ? [] : [{ lane, bonus: { at, ...(seq === undefined ? {} : { seq }), effect } }];
  });
}

/** BOT-04 : le bot de ce couloir reçoit ce bonus : le moteur rejoue sa course avec lui, comme le serveur. */
export const applyBotBonus = (race: Race, lane: number, bonus: BotBonus): Race => replayBot(race, lane, bonus);

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
  // BONUS-04 : -3 mots retire ce qu'a décidé le serveur (`removed`, borné sur ses mots validés), même si la page est
  // déjà plus loin : les deux textes restent les mêmes. Le serveur ne valide jamais plus que la page, donc ses mots
  // validés sont au plus `wordIndex`, et `removed` ne dépasse pas « mots − validés − 1 ».
  const done = effect.kind === "fewer_words" ? Math.min(race.wordIndex, course.words.length - effect.removed - 1) : race.wordIndex;
  const words = editWords(course.words, effect, done);
  if (words.length === course.words.length) return race;
  const marks = [0];
  words.forEach((word, i) => marks.push(marks[i]! + word.length + 1));
  const mine = { ...course, words, marks };
  if (race.wordIndex < words.length) return { ...race, mine };
  // déjà tapé tout mon nouveau texte : j'arrive, sur ses mots (les fautes des mots retirés ne comptent plus)
  const missedWords = new Set([...race.missedWords].filter((i) => i < words.length));
  const missedChars = [...missedWords].reduce((sum, i) => sum + words[i]!.length + 1, 0);
  return { ...race, mine, wordIndex: words.length, typed: "", missedWords, missedChars, finishedAt: now, now, arrivals: [...race.arrivals, race.myLane] };
}

/**
 * BONUS-04 : mon texte tel que le serveur le garde (message `text`, envoyé quand je rejoins la salle) : une page reprise
 * sans son instantané (autre onglet, autre appareil) court sur le même texte que l'arbitre. Sans effet hors course, une
 * fois arrivé, ou si c'est déjà mon texte.
 */
export function applyServerText(race: Race, words: readonly string[]): Race {
  if (race.phase !== "racing" || race.finishedAt || !words.length) return race;
  const course = myCourse(race);
  if (course.words.length === words.length && course.words.every((word, i) => word === words[i])) return race;
  const { durationMs, mistakes } = course;
  const mine = { ...createCourse([...words], null, mistakes), durationMs };
  if (race.wordIndex < words.length) return { ...race, mine };
  return { ...race, mine, wordIndex: words.length, typed: "", finishedAt: race.now, arrivals: [...race.arrivals, race.myLane] };
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
