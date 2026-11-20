// Déroulé d'une course. COURSE-05 : seuls les bots du salon sont simulés ; un adversaire humain avance avec la progression
// qu'il envoie en temps réel (applyRemote). Progression déclarée par le client : le serveur autoritaire reste à faire (COURSE-06).
import { countKey, type KeyCounts } from "../../players/keys";
import { transition, type RaceEvent, type RaceState } from "../../rooms/race-state";
import { BOT_ACCURACY_FACTOR, BOT_LEVEL_SPECS, BOT_START, BOT_TICK_MS, botArrived, botErrorChance, botJitter, botPosition, botProfile, botSeed, botStep, botText, levelOfSpeed, type BotProfile, type BotState, type BotText } from "../../rooms/bot-engine";
import type { BotAccuracy, BotSpeed, MistakeMode, Player } from "../room/room";

export const CHARS_PER_WORD = 5;
/** BOT-05 : le pas du moteur des bots (src/rooms/bot-engine.ts). */
export const TICK_MS = BOT_TICK_MS;

export type Course = { words: string[]; /** Caractères cumulés (espaces comprises) après chaque mot. */ marks: number[]; /** CONF-01 : null = aucun temps maximal. */ durationMs: number | null; mistakes: MistakeMode };
/**
 * typed et errors : frappes et fautes cumulées, comme pour moi. keys : les mêmes, touche par touche.
 * BOT-05 : seed, la graine du bot (celle du salon mêlée à son nom) ; tick, le dernier tick du moteur joué.
 * BOT-01 à BOT-03 : son profil (niveau, vitesse, précision) et l'état du moteur (caractères, fautes, attente,
 * caractères manqués en mode libre, `out` : éliminé en mode fatal) ; words, sa position en mots.
 */
export type Bot = { lane: number; name: string; seed: number; tick: number; words: number; keys: KeyCounts; finishedAt: number } & BotProfile & BotState;
/** COURSE-05 : un adversaire humain, tel qu'il se déclare en temps réel (progression de 0 à 1, MPM courant). */
export type Remote = {
  lane: number;
  progress: number;
  wpm: number;
  finishedAt: number;
  /** BONUS-03 : les mots de son texte, quand un bonus l'a changé (src/views/game/bonus.ts), et sa progression d'avant. */
  words?: number;
  stale?: number;
};
/** Cumuls de fin de seconde : caractères validés, caractères tapés, fautes. */
export type Sample = { chars: number; typed: number; errors: number };
export type Phase = "countdown" | "racing" | "done";
export type Race = {
  course: Course;
  phase: Phase;
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
  /** COURSE-05 : les autres humains du salon. */
  remotes: Remote[];
  /** Les couloirs, dans l'ordre d'arrivée. */
  arrivals: number[];
  /** Une mesure par seconde et par couloir. */
  samples: Sample[][];
  /** BONUS-02 : mon texte, quand un bonus l'a changé (+3 / -3 mots) ; les bots gardent `course` (src/views/game/bonus.ts). */
  mine?: Course;
  /** BONUS-02 : le brouillard sur mes prochains mots, jusqu'à cette heure (serveur, ms epoch). */
  fogUntil?: number;
};

/** BONUS-02 : le texte que je tape, celui de la course sauf si un bonus l'a changé. */
export const myCourse = (race: Race): Course => race.mine ?? race.course;

/** COURSE-01 : chaque phase de la page est un état du salon (src/rooms/race-state.ts). */
export const PHASE_STATE: Record<Phase, RaceState> = { countdown: "countdown", racing: "racing", done: "results" };
const STATE_PHASE: Partial<Record<RaceState, Phase>> = { countdown: "countdown", racing: "racing", results: "done" };

/** COURSE-01 : la phase après `event`, par la machine du serveur ; une transition hors du schéma ne change rien. */
function nextPhase(phase: Phase, event: RaceEvent): Phase | null {
  try {
    return STATE_PHASE[transition(PHASE_STATE[phase], event)] ?? null;
  } catch {
    return null;
  }
}

/** COURSE-01 : fin du décompte (DÉCOMPTE → EN_COURSE). Sans effet hors du décompte. */
export function startRace(race: Race, now: number): Race {
  const phase = nextPhase(race.phase, "start");
  return phase ? { ...race, phase, count: null, startedAt: now, now } : race;
}

/** COURSE-01 : fin de la course (EN_COURSE → RÉSULTATS). Sans effet hors de la course. */
export function endRace(race: Race): Race {
  const phase = nextPhase(race.phase, "finish");
  return phase ? { ...race, phase } : race;
}

export function createCourse(words: string[], durationSeconds: number | null, mistakes: MistakeMode): Course {
  const marks = [0];
  words.forEach((word, i) => marks.push(marks[i]! + word.length + 1));
  return { words, marks, durationMs: durationSeconds === null ? null : durationSeconds * 1000, mistakes };
}

/**
 * BOT-05 : `source` est la graine du salon (rooms.text_seed) : chaque bot tire son profil et ses aléas du moteur, par
 * son nom, comme le serveur. Une fonction d'aléa reste acceptée (tests, page sans serveur de salons).
 */
export function createRace(course: Course, players: Player[], botSpeed: BotSpeed, botAccuracy: BotAccuracy, source: (() => number) | number = Math.random): Race {
  const bots: Bot[] = [];
  const remotes: Remote[] = [];
  players.forEach((player, lane) => {
    if (player.me) return;
    if (!player.bot) {
      remotes.push({ lane, progress: 0, wpm: 0, finishedAt: 0 });
      return;
    }
    // CONF-10 : chaque bot à son niveau ; sans niveau, celui de la vitesse du salon
    const level = player.level ?? levelOfSpeed(botSpeed);
    const start = { lane, name: player.name, tick: 0, words: 0, keys: {}, finishedAt: 0, ...BOT_START };
    if (typeof source === "number") {
      const seed = botSeed(source, player.name);
      bots.push({ ...start, seed, ...botProfile(seed, level, botAccuracy) });
      return;
    }
    const { wpm: [low, high], errorRate } = BOT_LEVEL_SPECS[level];
    const wpm = Math.round(low + source() * (high - low));
    const accuracy = 100 * (1 - errorRate * BOT_ACCURACY_FACTOR[botAccuracy] * (0.8 + source() * 0.4));
    bots.push({ ...start, level, wpm, accuracy, seed: Math.floor(source() * 2 ** 32) | 0 });
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
    remotes,
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
  const { words, mistakes } = myCourse(race);
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

const unit = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

/**
 * COURSE-05 : la progression qu'un adversaire humain vient d'envoyer. Elle ne recule jamais (un message en retard ne
 * ramène pas son poisson en arrière) ; à 1, il arrive, une seule fois. Mon couloir et ceux des bots ne bougent pas ici.
 * BONUS-03 : la dernière progression relayée avant un bonus sur son texte (`stale`), relayée de nouveau, ne le refait
 * pas avancer ; elle reste ignorée jusqu'à la progression suivante, même après plusieurs bonus.
 */
export function applyRemote(race: Race, lane: number, update: { progress: number; wpm: number }, now: number): Race {
  const remote = race.remotes.find((candidate) => candidate.lane === lane);
  if (!remote || remote.finishedAt) return race;
  const old = update.progress === remote.stale;
  const progress = old ? remote.progress : Math.max(remote.progress, unit(update.progress));
  const wpm = Number.isFinite(update.wpm) ? Math.max(0, Math.round(update.wpm)) : remote.wpm;
  const stale = old ? remote.stale : undefined;
  if (progress === remote.progress && wpm === remote.wpm && stale === remote.stale) return race;
  const arrived = progress >= 1;
  const moved: Remote = { ...remote, progress, wpm, finishedAt: arrived ? now : 0, stale };
  return {
    ...race,
    remotes: race.remotes.map((candidate) => (candidate === remote ? moved : candidate)),
    arrivals: arrived ? [...race.arrivals, lane] : race.arrivals,
  };
}

/**
 * BOT-05 : sans `jitters`, chaque bot rattrape le moteur jusqu'au tick de `now` (temps depuis le départ, borné à la
 * durée), avec les aléas de sa graine : sa position ne dépend que du temps, pas du rythme des ticks du navigateur, et son
 * arrivée est celle du moteur (départ + ticks), celle que calcule aussi le serveur. `jitters` (un tirage par bot) joue
 * un seul pas avec ces tirages : réservé aux tests.
 */
export function advanceBots(race: Race, now: number, jitters?: number[]): Race {
  if (race.phase !== "racing") return race;
  const { durationMs } = race.course;
  const text = botText(race.course.words, race.course.mistakes);
  const arrivals = [...race.arrivals];
  let bots = race.bots;
  // BOT-03 : un bot éliminé (mode fatal) s'arrête là, sans arrivée ; un bot arrivé prend la place suivante
  const settle = (moved: Bot, at: number): Bot => {
    if (moved.out) return { ...moved, finishedAt: at };
    if (!botArrived(text, moved)) return moved;
    arrivals.push(moved.lane);
    return { ...moved, finishedAt: at };
  };
  if (jitters) {
    bots = bots.map((bot, i) => (bot.finishedAt ? bot : settle(botTick(race, text, bot, jitters[i] ?? 0.5), now)));
  } else {
    // tick par tick, tous les bots à la fois : deux arrivées rattrapées d'un coup restent dans leur ordre
    const target = Math.floor(capped(race, now - race.startedAt) / TICK_MS);
    for (let tick = Math.min(...bots.map((bot) => bot.tick)) + 1; tick <= target; tick++) {
      bots = bots.map((bot) => (bot.finishedAt || bot.tick >= tick ? bot : settle({ ...botTick(race, text, bot, botJitter(bot.seed, tick)), tick }, race.startedAt + tick * TICK_MS)));
    }
  }
  const ticked: Race = { ...race, bots, arrivals, now };
  const moved = durationMs !== null && now - race.startedAt >= durationMs ? endRace(ticked) : ticked;
  return { ...moved, samples: recordSamples(moved) };
}

/**
 * Un pas du moteur pour ce bot : ses caractères, frappes et fautes viennent du moteur (BOT-03). Ses touches suivent le
 * texte qu'il dépasse, avec des fautes réparties selon sa précision, plus nombreuses sur les touches difficiles.
 */
function botTick(race: Race, text: BotText, bot: Bot, jitter: number): Bot {
  const state = botStep(text, bot, bot, jitter);
  const keys = botKeys(race, bot, bot.chars, state.chars - bot.chars);
  return { ...bot, ...state, words: botPosition(text, state.chars), keys };
}

/**
 * Chaque caractère du texte qu'un bot dépasse ce tick-ci, avec les fautes qu'il y fait en moyenne : la chance de faute
 * du moteur (botErrorChance, plus forte sur les touches difficiles). Le total des fautes des touches suit donc
 * `bot.errors` ; en mode « corriger », la touche est aussi retapée.
 */
function botKeys(race: Race, bot: Bot, from: number, gained: number): KeyCounts {
  const text = race.course.words.join(" ") + " ";
  const { mistakes } = race.course;
  let counts = bot.keys;
  for (let i = Math.floor(from); i < Math.floor(from + gained) && i < text.length; i++) {
    const misses = botErrorChance(bot, mistakes, text[i]!);
    counts = countKey(counts, text[i]!, misses > 0, mistakes === "fix" ? 1 + misses : 1, misses);
  }
  return counts;
}

function myValidChars(race: Race) {
  return Math.max(0, myCourse(race).marks[race.wordIndex]! - race.missedChars);
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
  const remote = race.remotes.find((candidate) => candidate.lane === lane);
  if (remote) {
    if (remote.finishedAt) return null;
    const chars = remote.progress * (race.course.marks.at(-1) ?? 0);
    return { chars, typed: chars, errors: 0 };
  }
  const bot = race.bots.find((candidate) => candidate.lane === lane);
  if (!bot || bot.finishedAt) return null;
  return { chars: Math.max(0, botChars(race, bot) - bot.missed), typed: bot.typed, errors: bot.errors };
}

function recordSamples(race: Race) {
  // un tick tardif ne mesure pas au-delà de la durée de la course : le serveur refuse plus de secondes qu'elle n'en a
  const second = Math.floor(capped(race, race.now - race.startedAt) / 1000);
  return race.samples.map((samples, lane) => {
    const sample = samples.length < second ? sampleOf(race, lane) : null;
    if (!sample) return samples;
    // un onglet en arrière-plan peut sauter des secondes
    return [...samples, ...Array.from({ length: second - samples.length }, () => sample)];
  });
}

/** Un joueur attend ses bots ; un spectateur (aucun couloir à lui) attend aussi chaque humain. */
export const everyoneDone = (race: Race) =>
  race.myLane < 0
    ? race.bots.every((bot) => bot.finishedAt > 0) && race.remotes.every((remote) => remote.finishedAt > 0)
    : race.finishedAt > 0 && race.bots.every((bot) => bot.finishedAt > 0);

/** Un temps de course borné à sa durée : la fin n'est vue qu'au tick, parfois en retard (onglet en arrière-plan). */
const capped = (race: Race, ms: number) => Math.min(race.course.durationMs ?? Infinity, Math.max(0, ms));

export function elapsedMs(race: Race) {
  return race.startedAt ? capped(race, (race.finishedAt || race.now) - race.startedAt) : 0;
}

/** CONF-01 : null sans temps maximal (pas de compte à rebours). */
export function secondsLeft(race: Race) {
  if (race.course.durationMs === null) return null;
  return Math.ceil(Math.max(0, race.course.durationMs - (race.startedAt ? race.now - race.startedAt : 0)) / 1000);
}

/** COURSE-04 : les lettres justes du mot en cours, jusqu'à la première faute. */
function currentRightChars(race: Race) {
  const target = myCourse(race).words[race.wordIndex] ?? "";
  let k = 0;
  while (k < race.typed.length && race.typed[k] === target[k]) k++;
  return k;
}

/** Vitesse en mots par minute (annexe A) : les caractères des mots réussis, plus les lettres justes du mot en cours. */
export function myWpm(race: Race) {
  const minutes = elapsedMs(race) / 60000;
  return minutes > 0.02 ? Math.round((myValidChars(race) + currentRightChars(race)) / CHARS_PER_WORD / minutes) : 0;
}

export function myAccuracy(race: Race) {
  if (!race.keystrokes) return 100;
  return Math.max(0, Math.round((100 * (race.keystrokes - race.wrongChars - race.extraChars)) / race.keystrokes));
}

/** Temps passé en course dans ce couloir, en millisecondes. */
export function laneElapsedMs(race: Race, lane: number) {
  if (lane === race.myLane) return elapsedMs(race);
  const remote = race.remotes.find((candidate) => candidate.lane === lane);
  if (remote) return race.startedAt ? capped(race, (remote.finishedAt || race.now) - race.startedAt) : 0;
  const bot = race.bots.find((candidate) => candidate.lane === lane);
  return bot && race.startedAt ? capped(race, (bot.finishedAt || race.now) - race.startedAt) : 0;
}

/** Vitesse finale de ce couloir, en mots par minute. */
export function laneWpm(race: Race, lane: number) {
  if (lane === race.myLane) return myWpm(race);
  const remote = race.remotes.find((candidate) => candidate.lane === lane);
  if (remote) return remote.wpm;
  const bot = race.bots.find((candidate) => candidate.lane === lane);
  const minutes = laneElapsedMs(race, lane) / 60000;
  // BOT-03 : en mode libre, les mots laissés faux ne comptent pas (annexe A, caractères justes)
  return bot && minutes > 0.02 ? Math.round(Math.max(0, (race.course.marks[Math.floor(bot.words)] ?? 0) - bot.missed) / CHARS_PER_WORD / minutes) : 0;
}

/** Part du texte faite dans ce couloir, de 0 à 1. */
export function laneProgress(race: Race, lane: number) {
  const remote = race.remotes.find((candidate) => candidate.lane === lane);
  if (remote) return remote.progress;
  if (lane === race.myLane) return Math.min(1, race.wordIndex / myCourse(race).words.length);
  const words = race.bots.find((bot) => bot.lane === lane)?.words ?? 0;
  return Math.min(1, words / race.course.words.length);
}
