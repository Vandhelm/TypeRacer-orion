import { describe, expect, test } from "bun:test";
import type { ServerBonus } from "../../realtime/client";
import { editWords, type BonusEffect } from "../../rooms/bonus-effects";
import type { Player } from "../room/room";
import { applyBonus, applyRemoteBonus, bonusesFor, fogged, remoteBonuses } from "./bonus";
import { advanceBots, applyInput, applyRemote, createCourse, createRace, laneProgress, laneWpm, myCourse, myWpm, progressReport, raceText, type Race } from "./race";
import type { RaceLanes } from "./track";

const ME: Player = { name: "me", color: "red", me: true };
const BOT: Player = { name: "bot", color: "blue", bot: true };
const WORDS = ["le", "riz", "attend", "la", "sauce", "soja", "et", "un", "bol"];

function racing(words = WORDS): Race {
  const race = createRace(createCourse(words, 60, "fix"), [ME, BOT], "medium", "high", () => 0.5);
  return { ...race, phase: "racing", count: null, startedAt: 1000, now: 1000 };
}
const type = (race: Race, ...values: string[]) => values.reduce((r, value) => applyInput(r, value, 2000), race);
const fewer: BonusEffect = { kind: "fewer_words", target: "g:me", removed: 3 };
const extra: BonusEffect = { kind: "extra_words", target: "g:me", words: ["nori", "maki", "wasabi"] };
const fog: BonusEffect = { kind: "fog", target: "g:me", durationMs: 5000 };

describe("BONUS-02 — the race page applies the bonus effect it receives", () => {
  test("-3 words: my text loses its 3 last words, my progress counts on the shorter text", () => {
    const race = applyBonus(type(racing(), "le "), fewer, 3000);
    expect(myCourse(race).words).toEqual(WORDS.slice(0, 6));
    expect(myCourse(race).marks.at(-1)).toBe(WORDS.slice(0, 6).join(" ").length + 1);
    expect(laneProgress(race, race.myLane)).toBeCloseTo(1 / 6, 6);
  });

  test("+3 words: the words are added at the end of my text; typing all of them is needed to finish", () => {
    let race = applyBonus(type(racing(), "le "), extra, 3000);
    expect(myCourse(race).words).toEqual([...WORDS, "nori", "maki", "wasabi"]);
    expect(laneProgress(race, race.myLane)).toBeCloseTo(1 / 12, 6);
    race = type(race, ...WORDS.slice(1).map((w) => `${w} `));
    expect(race.finishedAt).toBe(0);
    race = type(race, "nori ", "maki ", "wasabi");
    expect(race.finishedAt).toBe(2000);
    expect(laneProgress(race, race.myLane)).toBe(1);
  });

  test("bots keep the course text: a bonus on my text does not change theirs", () => {
    const race = applyBonus(racing(), extra, 3000);
    expect(race.course.words).toEqual(WORDS);
    let moved = race;
    for (let tick = 1; tick <= 100; tick++) moved = advanceBots(moved, 1000 + tick * 200, [0.5]);
    expect(moved.bots[0]!.finishedAt).toBeGreaterThan(0);
    expect(moved.bots[0]!.words).toBe(WORDS.length);
  });

  test("my speed counts the characters of my own text", () => {
    const race = { ...type(applyBonus(racing(), fewer, 3000), "le ", "riz "), now: 61_000 };
    expect(myWpm(race)).toBe(Math.round("le riz ".length / 5));
  });

  test("fog: my next words blur for its duration, then clear", () => {
    const race = applyBonus(racing(), fog, 3000);
    expect(myCourse(race).words).toEqual(WORDS);
    expect(fogged({ ...race, now: 7999 })).toBe(true);
    expect(fogged({ ...race, now: 8000 })).toBe(false);
    expect(fogged(racing())).toBe(false);
  });

  test("no effect outside the race or after my finish", () => {
    const waiting = { ...racing(), phase: "countdown" as const };
    expect(applyBonus(waiting, fewer, 3000)).toBe(waiting);
    const done = { ...racing(), finishedAt: 2000 };
    expect(applyBonus(done, extra, 3000)).toBe(done);
  });

  // BONUS-04 : la borne est celle du serveur (`removed`, sur ses mots validés), la même des deux côtés ; avant, la page
  // rebornait sur sa propre position et gardait ici tout le texte (voir « BONUS-04 » plus bas, page en avance)
  test("-3 words never removes the word I am typing: 2 words left, the server removes only the last one", () => {
    const race = applyBonus(type(racing(), ...WORDS.slice(0, 7).map((w) => `${w} `)), { ...fewer, removed: 1 }, 3000);
    expect(myCourse(race).words).toEqual(WORDS.slice(0, 8));
    expect(race.finishedAt).toBe(0);
  });

  test("only the new bonuses that target me are applied, once each", () => {
    const bonus = (effect?: BonusEffect): ServerBonus => ({ type: "bonus", room: "RMQWZC", playerId: "g:late", checkpoint: 1, count: 1, ...(effect ? { effect } : {}) });
    const list = [bonus(fewer), bonus({ ...fog, target: "g:other" }), bonus(), bonus(extra)];
    expect(bonusesFor(list, 0, "g:me")).toEqual([fewer, extra]);
    expect(bonusesFor(list, 1, "g:me")).toEqual([extra]);
    expect(bonusesFor(list, 4, "g:me")).toEqual([]);
    expect(bonusesFor(list, 0, null)).toEqual([]);
    expect(bonusesFor(undefined, 0, "g:me")).toEqual([]);
  });
});

describe("BONUS-03 — the lane of another human follows the bonus that changed their text", () => {
  const RIVAL: Player = { name: "rival", color: "green" };
  // 9 mots, 6 faits : +3 mots → 6/12 ; -3 mots → 6/7 (le mot en cours reste)
  function rivalAt(progress: number): Race {
    const race = createRace(createCourse(WORDS, 60, "fix"), [ME, RIVAL], "medium", "high", () => 0.5);
    return applyRemote({ ...race, phase: "racing", count: null, startedAt: 1000, now: 1000 }, 1, { progress, wpm: 60 }, 2000);
  }
  const lanes: RaceLanes = { players: [ME, RIVAL], keys: ["guest:me", "player:7"] };
  const extra3: BonusEffect = { kind: "extra_words", target: "u:7", words: ["a", "b", "c"] };

  test("+3 words on the leader: their lane moves back to the same words done on the longer text", () => {
    expect(laneProgress(applyRemoteBonus(rivalAt(6 / 9), 1, extra3), 1)).toBeCloseTo(6 / 12, 6);
  });

  test("the progress they sent before the bonus, relayed again, does not bring the lane forward again", () => {
    let race = applyRemoteBonus(rivalAt(6 / 9), 1, extra3);
    race = applyRemote(race, 1, { progress: 6 / 9, wpm: 61 }, 2100);
    expect(laneProgress(race, 1)).toBeCloseTo(6 / 12, 6);
    expect(laneWpm(race, 1)).toBe(61);
    race = applyRemote(race, 1, { progress: 7 / 12, wpm: 62 }, 2200);
    expect(laneProgress(race, 1)).toBeCloseTo(7 / 12, 6);
  });

  // 20 mots, la moitié faite : 10 mots validés
  function rivalOn20(progress: number): Race {
    const words = Array.from({ length: 20 }, (_, i) => `mot${i}`);
    const race = createRace(createCourse(words, 60, "fix"), [ME, RIVAL], "medium", "high", () => 0.5);
    return applyRemote({ ...race, phase: "racing", count: null, startedAt: 1000, now: 1000 }, 1, { progress, wpm: 60 }, 2000);
  }

  test("two bonuses before their next progress: the progress from before both, relayed again, does not bring the lane back", () => {
    let race = applyRemoteBonus(applyRemoteBonus(rivalOn20(0.5), 1, extra3), 1, extra3);
    expect(laneProgress(race, 1)).toBeCloseTo(10 / 26, 6);
    race = applyRemote(race, 1, { progress: 0.5, wpm: 60 }, 2100);
    expect(laneProgress(race, 1)).toBeCloseTo(10 / 26, 6);
  });

  test("after a bonus, their real next progress on the longer text is shown, even below the old one", () => {
    let race = applyRemoteBonus(rivalOn20(0.5), 1, extra3);
    race = applyRemote(race, 1, { progress: 11 / 23, wpm: 60 }, 2100);
    expect(laneProgress(race, 1)).toBeCloseTo(11 / 23, 6);
  });

  test("progress, bonus, progress, bonus: the progress relayed last before the second bonus does not come back", () => {
    let race = applyRemoteBonus(rivalOn20(0.5), 1, extra3);
    race = applyRemote(race, 1, { progress: 11 / 23, wpm: 60 }, 2100);
    race = applyRemoteBonus(race, 1, extra3);
    expect(laneProgress(race, 1)).toBeCloseTo(11 / 26, 6);
    race = applyRemote(race, 1, { progress: 11 / 23, wpm: 61 }, 2200);
    expect(laneProgress(race, 1)).toBeCloseTo(11 / 26, 6);
  });

  test("a second +3 words counts on the text already lengthened", () => {
    expect(laneProgress(applyRemoteBonus(applyRemoteBonus(rivalAt(6 / 9), 1, extra3), 1, extra3), 1)).toBeCloseTo(6 / 15, 6);
  });

  test("-3 words on a runner behind: their lane moves forward, never past the word they type", () => {
    expect(laneProgress(applyRemoteBonus(rivalAt(6 / 9), 1, { kind: "fewer_words", target: "u:7", removed: 3 }), 1)).toBeCloseTo(6 / 7, 6);
  });

  test("fog, an arrived runner, my lane or an unknown lane: nothing moves", () => {
    const race = rivalAt(6 / 9);
    expect(applyRemoteBonus(race, 1, { kind: "fog", target: "u:7", durationMs: 5000 })).toBe(race);
    const arrived = applyRemote(race, 1, { progress: 1, wpm: 60 }, 2100);
    expect(applyRemoteBonus(arrived, 1, extra3)).toBe(arrived);
    expect(applyRemoteBonus(race, 0, extra3)).toBe(race);
    expect(applyRemoteBonus(race, 5, extra3)).toBe(race);
  });

  test("only the new text bonuses on the other humans of the track are kept, with their lane", () => {
    const bonus = (effect?: BonusEffect): ServerBonus => ({ type: "bonus", room: "RMQWZC", playerId: "g:me", checkpoint: 1, count: 1, ...(effect ? { effect } : {}) });
    const list = [bonus(extra3), bonus(fewer), bonus({ kind: "fog", target: "u:7", durationMs: 5000 }), bonus(), bonus({ ...extra3, target: "u:99" })];
    expect(remoteBonuses(list, 0, lanes, "g:me")).toEqual([{ lane: 1, effect: extra3 }]);
    expect(remoteBonuses(list, 1, lanes, "g:me")).toEqual([]);
    expect(remoteBonuses(undefined, 0, lanes, "g:me")).toEqual([]);
  });
});

describe("BONUS-04 — progress and speed stay consistent on the text a bonus lengthened or shortened", () => {
  // 20 mots de 4 lettres : 5 caractères par mot, espace comprise ; une minute de course
  const TWENTY = Array.from({ length: 20 }, (_, i) => `m${String(i).padStart(3, "0")}`);
  const ADDED = ["nori", "maki", "soja"];
  const plus: BonusEffect = { kind: "extra_words", target: "g:me", words: ADDED };
  const minus: BonusEffect = { kind: "fewer_words", target: "g:me", removed: 3 };
  const typeAll = (race: Race) => type(race, ...myCourse(race).words.slice(race.wordIndex).map((w, i, all) => (i === all.length - 1 ? w : `${w} `)));
  const half = () => type(racing(TWENTY), ...TWENTY.slice(0, 10).map((w) => `${w} `));
  const at61s = (race: Race) => ({ ...race, finishedAt: 61_000, now: 61_000 });

  test("+3 words at mid-race, then the finish: progress 1, speed on the 23 words, the 23 words are the text sent", () => {
    const race = at61s(typeAll(applyBonus(half(), plus, 3000)));
    expect(laneProgress(race, race.myLane)).toBe(1);
    expect(myWpm(race)).toBe(23); // 23 mots × 5 caractères ÷ 5 ÷ 1 minute
    expect(raceText(race)).toBe([...TWENTY, ...ADDED].join(" "));
  });

  test("-3 words at mid-race, then the finish: progress 1, speed on the 17 words, the 17 words are the text sent", () => {
    const race = at61s(typeAll(applyBonus(half(), minus, 3000)));
    expect(laneProgress(race, race.myLane)).toBe(1);
    expect(myWpm(race)).toBe(17);
    expect(raceText(race)).toBe(TWENTY.slice(0, 17).join(" "));
  });

  test("two bonuses (+3 then -3): progress 1, speed and text on the 20 words left", () => {
    const race = at61s(typeAll(applyBonus(applyBonus(half(), plus, 3000), minus, 3500)));
    expect(myCourse(race).words).toEqual([...TWENTY, ...ADDED].slice(0, 20));
    expect(laneProgress(race, race.myLane)).toBe(1);
    expect(myWpm(race)).toBe(20);
    expect(raceText(race)).toBe(myCourse(race).words.join(" "));
  });

  test("without a bonus, the text sent is the course text", () => {
    expect(raceText(racing(TWENTY))).toBe(TWENTY.join(" "));
  });

  test("-3 words removes what the server decided, even when my page is ahead of it: the same text on both sides", () => {
    // le serveur a validé 16 mots (il en retire 3, le 17e reste à taper) ; la page en est déjà au 18e
    const ahead = type(racing(TWENTY), ...TWENTY.slice(0, 17).map((w) => `${w} `));
    const race = applyBonus(ahead, minus, 3000);
    expect(myCourse(race).words).toEqual(editWords(TWENTY, minus, 16));
    expect(myCourse(race).words).toHaveLength(17);
    // tout mon nouveau texte est déjà tapé : j'arrive
    expect(race.finishedAt).toBe(3000);
    expect(laneProgress(race, race.myLane)).toBe(1);
    expect(race.arrivals).toContain(race.myLane);
  });

  test("the progress I send names the length of my text, so the server can tell a progress sent before the bonus", () => {
    expect(progressReport(applyBonus(half(), plus, 3000))).toEqual({ progress: 10 / 23, words: 23 });
    expect(progressReport(half())).toEqual({ progress: 0.5, words: 20 });
  });
});
