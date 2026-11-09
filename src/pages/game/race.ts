// Déroulé d'une course. À BRANCHER : les adversaires sont simulés, leur progression doit venir du serveur de jeu.
import type { BotSpeed, MistakeMode, Player } from "../room/room";

const BOT_WPM: Record<BotSpeed, [number, number]> = { slow: [25, 40], medium: [40, 65], fast: [65, 100], mixed: [25, 100] };
const CHARS_PER_WORD = 5;
export const TICK_MS = 200;

export type Course = { words: string[]; /** Caractères cumulés (espaces comprises) après chaque mot. */ marks: number[]; durationMs: number; mistakes: MistakeMode };
export type Bot = { lane: number; wpm: number; words: number; finishedAt: number };
export type Race = {
  course: Course;
  phase: "countdown" | "racing" | "done";
  count: number | null;
  myLane: number;
  startedAt: number;
  now: number;
  wordIndex: number;
  typed: string;
  keystrokes: number;
  wrongChars: number;
  extraChars: number;
  missedWords: ReadonlySet<number>;
  missedChars: number;
  finishedAt: number;
  eliminated: boolean;
  bots: Bot[];
  /** Les couloirs, dans l'ordre d'arrivée. */
  arrivals: number[];
};

export function createCourse(words: string[], durationSeconds: number, mistakes: MistakeMode): Course {
  const marks = [0];
  words.forEach((word, i) => marks.push(marks[i]! + word.length + 1));
  return { words, marks, durationMs: durationSeconds * 1000, mistakes };
}

export function createRace(course: Course, players: Player[], botSpeed: BotSpeed, random: () => number = Math.random): Race {
  const [low, high] = BOT_WPM[botSpeed];
  const bots: Bot[] = [];
  players.forEach((player, lane) => {
    if (!player.me) bots.push({ lane, wpm: Math.round(low + random() * (high - low)), words: 0, finishedAt: 0 });
  });
  return {
    course,
    phase: "countdown",
    count: 3,
    myLane: players.findIndex((player) => player.me),
    startedAt: 0,
    now: 0,
    wordIndex: 0,
    typed: "",
    keystrokes: 0,
    wrongChars: 0,
    extraChars: 0,
    missedWords: new Set(),
    missedChars: 0,
    finishedAt: 0,
    eliminated: false,
    bots,
    arrivals: [],
  };
}

function miss(race: Race, wordLength: number): Pick<Race, "missedWords" | "missedChars"> {
  return { missedWords: new Set(race.missedWords).add(race.wordIndex), missedChars: race.missedChars + wordLength + 1 };
}

/** Applique le nouveau contenu du champ de saisie : corriger, continuer ou fatale, selon le salon. */
export function applyInput(race: Race, value: string, now: number): Race {
  if (race.phase !== "racing" || race.finishedAt) return race;
  const { words, mistakes } = race.course;
  const target = words[race.wordIndex] ?? "";
  const added = value.length > race.typed.length;
  const spaced = value.endsWith(" ");
  const clean = spaced ? value.slice(0, -1) : value;
  let { wrongChars, extraChars } = race;

  if (added) {
    // chaque lettre ajoutée : juste, fausse, ou en trop
    for (let k = race.typed.length; k < value.length; k++) {
      if (k === target.length && value[k] === " " && clean === target) continue;
      if (k >= target.length) extraChars += 1;
      else if (value[k] !== target[k]) wrongChars += 1;
    }
  }
  const counted = { keystrokes: race.keystrokes + (added ? value.length - race.typed.length : 0), wrongChars, extraChars };

  // fatale : la première faute arrête la course
  if (mistakes === "fatal" && added && !target.startsWith(clean) && !(spaced && clean === target)) {
    return { ...race, ...counted, eliminated: true, typed: value, finishedAt: now, now };
  }

  const correct = clean === target;
  const passes = spaced && clean.length > 0 && (correct || mistakes === "carry-on");
  if ((passes || (!spaced && correct)) && race.wordIndex === words.length - 1) {
    return {
      ...race,
      ...counted,
      ...(correct ? {} : miss(race, target.length)),
      wordIndex: words.length,
      typed: "",
      finishedAt: now,
      now,
      arrivals: [...race.arrivals, race.myLane],
    };
  }
  if (passes) {
    // À BRANCHER : envoyez la progression (wordIndex) au serveur ici.
    return { ...race, ...counted, ...(correct ? {} : miss(race, target.length)), wordIndex: race.wordIndex + 1, typed: "", now };
  }
  return { ...race, ...counted, typed: spaced ? clean : value, now };
}

/** jitters : un tirage entre 0 et 1 par adversaire, pour garder cette fonction pure. */
export function advanceBots(race: Race, now: number, jitters: number[]): Race {
  if (race.phase !== "racing") return race;
  const { words, durationMs } = race.course;
  const arrivals = [...race.arrivals];
  const bots = race.bots.map((bot, i) => {
    if (bot.finishedAt) return bot;
    // un adversaire tape à vitesse constante en caractères : les longs mots lui prennent plus de temps
    const current = words[Math.floor(bot.words)] ?? "";
    const pace = ((bot.wpm * CHARS_PER_WORD) / 60 / (current.length + 1)) * (TICK_MS / 1000);
    const progress = Math.min(words.length, bot.words + pace * (0.55 + (jitters[i] ?? 0.5) * 0.9));
    if (progress < words.length) return { ...bot, words: progress };
    arrivals.push(bot.lane);
    return { ...bot, words: progress, finishedAt: now };
  });
  return { ...race, bots, arrivals, now, phase: now - race.startedAt >= durationMs ? "done" : "racing" };
}

export const everyoneDone = (race: Race) => race.finishedAt > 0 && race.bots.every((bot) => bot.finishedAt > 0);

export function elapsedMs(race: Race) {
  return race.startedAt ? Math.max(0, (race.finishedAt || race.now) - race.startedAt) : 0;
}

export function secondsLeft(race: Race) {
  return Math.ceil(Math.max(0, race.course.durationMs - (race.startedAt ? race.now - race.startedAt : 0)) / 1000);
}

/** Vitesse en mots par minute : seuls comptent les caractères des mots réussis. */
export function myWpm(race: Race) {
  const minutes = elapsedMs(race) / 60000;
  const validChars = Math.max(0, race.course.marks[race.wordIndex]! - race.missedChars);
  return minutes > 0.02 ? Math.round(validChars / CHARS_PER_WORD / minutes) : 0;
}

export function myAccuracy(race: Race) {
  if (!race.keystrokes) return 100;
  return Math.max(0, Math.round((100 * (race.keystrokes - race.wrongChars - race.extraChars)) / race.keystrokes));
}

/** Part du texte faite dans ce couloir, de 0 à 1. */
export function laneProgress(race: Race, lane: number) {
  const words = lane === race.myLane ? race.wordIndex : (race.bots.find((bot) => bot.lane === lane)?.words ?? 0);
  return Math.min(1, words / race.course.words.length);
}
