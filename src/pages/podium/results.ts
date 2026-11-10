// Résultats d'une course, confiés par le jeu au podium et aux profils. À BRANCHER : le détail des adversaires est simulé, il doit venir du serveur de jeu.
import { CHARS_PER_WORD, laneElapsedMs, laneProgress, laneWpm, myAccuracy, type Race, type Sample } from "../game/race";
import type { BotAccuracy, Player, Room } from "../room/room";

export type PlayerResult = {
  name: string;
  me: boolean;
  wpm: number;
  raw: number;
  accuracy: number;
  seconds: number;
  /** justes, fausses, en trop, manquées */
  chars: [number, number, number, number];
  consistency: number;
  /** Part des secondes sans frappe, en %. */
  idle: number;
  finished: boolean;
  eliminated: boolean;
  wpmSeries: number[];
  rawSeries: number[];
  errorSeries: number[];
};
export type RaceSummary = Pick<Room, "textType" | "language" | "duration" | "level" | "punctuation" | "numbers" | "specials" | "accents" | "excluded" | "mistakes"> & {
  wordCount: number;
  sessionSeconds: number;
};
export type RaceResults = { players: PlayerResult[]; summary: RaceSummary };

const RESULTS_KEY = "orion-results";
const SESSION_KEY = "orion-session-start";
const BOT_ACCURACY: Record<BotAccuracy, [number, number]> = { shaky: [82, 90], decent: [90, 96], high: [96, 100] };

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

function consistencyOf(raw: number[]) {
  const mean = sum(raw) / (raw.length || 1);
  if (!mean) return 0;
  const deviation = Math.sqrt(sum(raw.map((value) => (value - mean) ** 2)) / raw.length);
  return Math.max(0, Math.round(100 * (1 - deviation / mean)));
}

const deltas = (samples: Sample[], pick: (sample: Sample) => number) => samples.map((sample, i) => pick(sample) - (i ? pick(samples[i - 1]!) : 0));

function detailOf(race: Race, lane: number, accuracy: number, random: () => number) {
  const samples = race.samples[lane] ?? [];
  const mine = lane === race.myLane;
  const typedPerSecond = deltas(samples, (sample) => sample.typed);
  // un adversaire reprend ses fautes : il frappe plus de caractères qu'il n'en valide
  const effort = mine ? 1 : 100 / (accuracy || 100);
  const errorSeries = mine
    ? deltas(samples, (sample) => sample.errors)
    : typedPerSecond.map((typed) => Math.max(0, Math.round(typed * (effort - 1) + random() - 0.5)));
  const wpm = laneWpm(race, lane);
  const lastChars = Math.round(samples.at(-1)?.chars ?? 0);
  return {
    raw: mine ? rawWpm(race, lane) : Math.round(wpm * effort),
    chars: (mine
      ? [race.keystrokes - race.wrongChars - race.extraChars, race.wrongChars, race.extraChars, race.missedChars]
      : [lastChars, sum(errorSeries), 0, 0]) as PlayerResult["chars"],
    consistency: consistencyOf(typedPerSecond.map((typed) => typed * effort)),
    idle: samples.length ? Math.round((1000 * typedPerSecond.filter((typed) => typed === 0).length) / samples.length) / 10 : 0,
    wpmSeries: samples.map((sample, i) => Math.round((sample.chars / CHARS_PER_WORD) * (60 / (i + 1)))),
    rawSeries: typedPerSecond.map((typed) => Math.round((typed * effort * 60) / CHARS_PER_WORD)),
    errorSeries,
  };
}

function rawWpm(race: Race, lane: number) {
  const minutes = laneElapsedMs(race, lane) / 60000;
  return minutes > 0.02 ? Math.round(race.keystrokes / CHARS_PER_WORD / minutes) : 0;
}

/** Les joueurs dans l'ordre final : les arrivées, puis les autres selon leur avancée. */
export function buildResults(race: Race, players: Player[], botAccuracy: BotAccuracy, random: () => number = Math.random): PlayerResult[] {
  const [low, high] = BOT_ACCURACY[botAccuracy];
  const others = players
    .map((_, lane) => lane)
    .filter((lane) => !race.arrivals.includes(lane))
    .sort((a, b) => laneProgress(race, b) - laneProgress(race, a));
  return [...race.arrivals, ...others].map((lane) => {
    const mine = lane === race.myLane;
    const accuracy = mine ? myAccuracy(race) : Math.round(low + random() * (high - low));
    return {
      name: players[lane]!.name,
      me: !!players[lane]!.me,
      wpm: laneWpm(race, lane),
      accuracy,
      seconds: Math.round(laneElapsedMs(race, lane) / 1000),
      finished: race.arrivals.includes(lane),
      eliminated: mine && race.eliminated,
      ...detailOf(race, lane, accuracy, random),
    };
  });
}

export function buildSummary(race: Race, room: Room, sessionSeconds: number): RaceSummary {
  const { textType, language, duration, level, punctuation, numbers, specials, accents, excluded, mistakes } = room;
  return { textType, language, duration, level, punctuation, numbers, specials, accents, excluded, mistakes, wordCount: race.course.words.length, sessionSeconds };
}

const numbersOf = (value: unknown) => (Array.isArray(value) ? value.map(Number) : []);

export function parseResults(raw: string | null): RaceResults | null {
  try {
    const stored = JSON.parse(raw ?? "null");
    if (!stored || !stored.summary || !Array.isArray(stored.players) || !stored.players.length) return null;
    const players = stored.players.map((p: Record<string, unknown>): PlayerResult => {
      const [correct = 0, wrong = 0, extra = 0, missed = 0] = numbersOf(p.chars);
      return {
        name: String(p.name),
        me: !!p.me,
        wpm: Number(p.wpm) || 0,
        raw: Number(p.raw) || 0,
        accuracy: Number(p.accuracy) || 0,
        seconds: Number(p.seconds) || 0,
        chars: [correct, wrong, extra, missed],
        consistency: Number(p.consistency) || 0,
        idle: Number(p.idle) || 0,
        finished: !!p.finished,
        eliminated: !!p.eliminated,
        wpmSeries: numbersOf(p.wpmSeries),
        rawSeries: numbersOf(p.rawSeries),
        errorSeries: numbersOf(p.errorSeries),
      };
    });
    return { players, summary: stored.summary as RaceSummary };
  } catch {
    return null;
  }
}

export function saveResults(results: RaceResults) {
  try { sessionStorage.setItem(RESULTS_KEY, JSON.stringify(results)); } catch { /* stockage indisponible */ }
}

export function readResults() {
  try { return parseResults(sessionStorage.getItem(RESULTS_KEY)); } catch { return null; }
}

/** La session commence à la première course de cet onglet. */
export function markSessionStart() {
  try { if (!sessionStorage.getItem(SESSION_KEY)) sessionStorage.setItem(SESSION_KEY, String(Date.now())); } catch { /* stockage indisponible */ }
}

export function sessionSeconds() {
  try { return Math.round((Date.now() - Number(sessionStorage.getItem(SESSION_KEY))) / 1000) || 0; } catch { return 0; }
}

export const profileHref = (index: number) => `/profile?player=${index}`;

export const oneDecimal = (language: string, value: number) =>
  new Intl.NumberFormat(language === "en" ? "en-CA" : "fr-CA", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);

function sample(name: string, wpm: number, me = false): PlayerResult {
  const seconds = Array.from({ length: 45 }, (_, i) => i);
  return {
    name, me, wpm, raw: wpm + 8, accuracy: 96, seconds: 45, chars: [Math.round(wpm * 3.75), 6, 2, 0], consistency: 71, idle: 0, finished: true, eliminated: false,
    wpmSeries: seconds.map((i) => Math.round(wpm * (1 + 2 / (i + 4)) + Math.sin(i / 3) * 2)),
    rawSeries: seconds.map((i) => Math.round(wpm + 8 + Math.sin(i * 1.7) * 14)),
    errorSeries: seconds.map((i) => (i % 13 === 5 ? 1 : 0)),
  };
}

/** Page ouverte sans partie : des joueurs d'exemple. */
export const SAMPLE_RESULTS: RaceResults = {
  players: [sample("Corail_418", 68, true), sample("Wasabi_77", 61), sample("Nori_203", 54), sample("Thon_Rouge", 47)],
  summary: { textType: "words", language: "fr", duration: 120, level: "common", punctuation: false, numbers: false, specials: false, accents: true, excluded: "", mistakes: "fix", wordCount: 31, sessionSeconds: 52 },
};
