// Déroulé d'une course. À BRANCHER : les adversaires sont simulés, leur progression doit venir du serveur de jeu.
import { countKey, type KeyCounts } from "../../players/keys";
import type { BotAccuracy, BotSpeed, MistakeMode, Player } from "../room/room";

const BOT_WPM: Record<BotSpeed, [number, number]> = { slow: [25, 40], medium: [40, 65], fast: [65, 100], mixed: [25, 100] };
/** Part des frappes justes, en %. Une faute est retapée : elle coûte du temps de frappe, pas de la vitesse nette. */
const BOT_ACCURACY: Record<BotAccuracy, [number, number]> = { shaky: [82, 90], decent: [90, 96], high: [96, 100] };
export const CHARS_PER_WORD = 5;
export const TICK_MS = 200;

export type Course = { words: string[]; /** Caractères cumulés (espaces comprises) après chaque mot. */ marks: number[]; durationMs: number; mistakes: MistakeMode };
/** typed et errors : frappes et fautes cumulées, comme pour moi. keys : les mêmes, touche par touche. */
export type Bot = { lane: number; wpm: number; accuracy: number; words: number; typed: number; errors: number; keys: KeyCounts; finishedAt: number };
/** Cumuls de fin de seconde : caractères validés, caractères tapés, fautes. */
export type Sample = { chars: number; typed: number; errors: number };
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
  /** Mes frappes et fautes, par caractère attendu. */
  keys: KeyCounts;
  missedWords: ReadonlySet<number>;
  missedChars: number;
  finishedAt: number;
  eliminated: boolean;
  bots: Bot[];
  /** Les couloirs, dans l'ordre d'arrivée. */
  arrivals: number[];
  /** Une mesure par seconde et par couloir. */
  samples: Sample[][];
};

export function createCourse(words: string[], durationSeconds: number, mistakes: MistakeMode): Course {
  const marks = [0];
  words.forEach((word, i) => marks.push(marks[i]! + word.length + 1));
  return { words, marks, durationMs: durationSeconds * 1000, mistakes };
}

export function createRace(course: Course, players: Player[], botSpeed: BotSpeed, botAccuracy: BotAccuracy, random: () => number = Math.random): Race {
  const [low, high] = BOT_WPM[botSpeed];
  const [worst, best] = BOT_ACCURACY[botAccuracy];
  const bots: Bot[] = [];
  players.forEach((player, lane) => {
    if (player.me) return;
    bots.push({ lane, wpm: Math.round(low + random() * (high - low)), accuracy: worst + random() * (best - worst), words: 0, typed: 0, errors: 0, keys: {}, finishedAt: 0 });
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
    keys: {},
    missedWords: new Set(),
    missedChars: 0,
    finishedAt: 0,
    eliminated: false,
    bots,
    arrivals: [],
    samples: players.map(() => []),
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
  let { wrongChars, extraChars, keys } = race;

  if (added) {
    // chaque lettre ajoutée : juste, fausse, ou en trop ; la touche attendue garde la frappe
    for (let k = race.typed.length; k < value.length; k++) {
      if (k === target.length && value[k] === " " && clean === target) {
        keys = countKey(keys, " ", false);
        continue;
      }
      if (k >= target.length) extraChars += 1;
      else {
        const wrong = value[k] !== target[k];
        if (wrong) wrongChars += 1;
        keys = countKey(keys, target[k]!, wrong);
      }
    }
  }
  const counted = { keystrokes: race.keystrokes + (added ? value.length - race.typed.length : 0), wrongChars, extraChars, keys };

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
    const jitter = jitters[i] ?? 0.5;
    // un adversaire tape à vitesse constante en caractères : les longs mots lui prennent plus de temps
    const current = words[Math.floor(bot.words)] ?? "";
    const pace = ((bot.wpm * CHARS_PER_WORD) / 60 / (current.length + 1)) * (TICK_MS / 1000);
    const progress = Math.min(words.length, bot.words + pace * (0.55 + jitter * 0.9));
    // chaque caractère validé coûte en moyenne 100 / précision frappes : le surplus, ce sont ses fautes
    const gained = botChars(race, { ...bot, words: progress }) - botChars(race, bot);
    const rate = (100 / bot.accuracy - 1) * (0.5 + jitter);
    const mistakes = gained * rate;
    const keys = botKeys(race, bot.keys, botChars(race, bot), gained, rate);
    const moved = { ...bot, words: progress, typed: bot.typed + gained + mistakes, errors: bot.errors + mistakes, keys };
    if (progress < words.length) return moved;
    arrivals.push(bot.lane);
    return { ...moved, finishedAt: now };
  });
  const moved: Race = { ...race, bots, arrivals, now, phase: now - race.startedAt >= durationMs ? "done" : "racing" };
  return { ...moved, samples: recordSamples(moved) };
}

/** Chaque caractère du texte qu'un bot dépasse ce tick-ci : ses fautes tombent plus souvent sur les touches difficiles. */
function botKeys(race: Race, keys: KeyCounts, from: number, gained: number, rate: number): KeyCounts {
  const text = race.course.words.join(" ") + " ";
  let counts = keys;
  for (let i = Math.floor(from); i < Math.floor(from + gained) && i < text.length; i++) {
    const misses = rate * difficulty(text[i]!);
    counts = countKey(counts, text[i]!, misses > 0, 1 + misses, misses);
  }
  return counts;
}

const difficulty = (char: string) => (/[a-z ]/.test(char) ? 1 : 2);

function myValidChars(race: Race) {
  return Math.max(0, race.course.marks[race.wordIndex]! - race.missedChars);
}

function botChars(race: Race, bot: Pick<Bot, "words">) {
  const { marks } = race.course;
  const whole = Math.floor(bot.words);
  const start = marks[whole] ?? 0;
  const next = marks[whole + 1];
  return next === undefined ? start : start + (bot.words - whole) * (next - start);
}

function sampleOf(race: Race, lane: number): Sample | null {
  if (lane === race.myLane) {
    return race.finishedAt ? null : { chars: myValidChars(race), typed: race.keystrokes, errors: race.wrongChars + race.extraChars };
  }
  const bot = race.bots.find((candidate) => candidate.lane === lane);
  if (!bot || bot.finishedAt) return null;
  return { chars: botChars(race, bot), typed: bot.typed, errors: bot.errors };
}

function recordSamples(race: Race) {
  const second = Math.floor((race.now - race.startedAt) / 1000);
  return race.samples.map((samples, lane) => {
    const sample = samples.length < second ? sampleOf(race, lane) : null;
    if (!sample) return samples;
    // un onglet en arrière-plan peut sauter des secondes
    return [...samples, ...Array.from({ length: second - samples.length }, () => sample)];
  });
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
  return minutes > 0.02 ? Math.round(myValidChars(race) / CHARS_PER_WORD / minutes) : 0;
}

export function myAccuracy(race: Race) {
  if (!race.keystrokes) return 100;
  return Math.max(0, Math.round((100 * (race.keystrokes - race.wrongChars - race.extraChars)) / race.keystrokes));
}

/** Temps passé en course dans ce couloir, en millisecondes. */
export function laneElapsedMs(race: Race, lane: number) {
  if (lane === race.myLane) return elapsedMs(race);
  const bot = race.bots.find((candidate) => candidate.lane === lane);
  return bot && race.startedAt ? Math.max(0, (bot.finishedAt || race.now) - race.startedAt) : 0;
}

/** Vitesse finale de ce couloir, en mots par minute. */
export function laneWpm(race: Race, lane: number) {
  if (lane === race.myLane) return myWpm(race);
  const bot = race.bots.find((candidate) => candidate.lane === lane);
  const minutes = laneElapsedMs(race, lane) / 60000;
  return bot && minutes > 0.02 ? Math.round((race.course.marks[Math.floor(bot.words)] ?? 0) / CHARS_PER_WORD / minutes) : 0;
}

/** Part du texte faite dans ce couloir, de 0 à 1. */
export function laneProgress(race: Race, lane: number) {
  const words = lane === race.myLane ? race.wordIndex : (race.bots.find((bot) => bot.lane === lane)?.words ?? 0);
  return Math.min(1, words / race.course.words.length);
}
