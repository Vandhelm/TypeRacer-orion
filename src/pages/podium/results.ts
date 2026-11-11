// Résultats d'une course, confiés par le jeu au podium et aux profils : tout vient de ce que chaque couloir a vraiment tapé pendant la course.
import { CHARS_PER_WORD, laneElapsedMs, laneProgress, laneWpm, myAccuracy, type Race, type Sample } from "../game/race";
import type { Player, Room } from "../room/room";

export type PlayerResult = {
  name: string;
  me: boolean;
  /** Un bot du jeu : ses courses sont enregistrées et son profil est public. */
  bot: boolean;
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
export type RaceSummary = Pick<Room, "textType" | "language" | "duration" | "level" | "punctuation" | "numbers" | "specials" | "accents" | "excluded" | "mistakes" | "botSpeed" | "botAccuracy" | "length"> & {
  wordCount: number;
  sessionSeconds: number;
};
export type RaceResults = { players: PlayerResult[]; summary: RaceSummary };

const RESULTS_KEY = "orion-results";
const SESSION_KEY = "orion-session-start";

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

function consistencyOf(raw: number[]) {
  const mean = sum(raw) / (raw.length || 1);
  if (!mean) return 0;
  const deviation = Math.sqrt(sum(raw.map((value) => (value - mean) ** 2)) / raw.length);
  return Math.max(0, Math.round(100 * (1 - deviation / mean)));
}

const deltas = (samples: Sample[], pick: (sample: Sample) => number) => samples.map((sample, i) => pick(sample) - (i ? pick(samples[i - 1]!) : 0));

/** Frappes et fautes cumulées d'un couloir, à la fin de sa course. */
function totalsOf(race: Race, lane: number) {
  if (lane === race.myLane) return { typed: race.keystrokes, wrong: race.wrongChars, extra: race.extraChars, missed: race.missedChars };
  const bot = race.bots.find((candidate) => candidate.lane === lane);
  return { typed: bot?.typed ?? 0, wrong: bot?.errors ?? 0, extra: 0, missed: 0 };
}

function accuracyOf(race: Race, lane: number) {
  if (lane === race.myLane) return myAccuracy(race);
  const { typed, wrong } = totalsOf(race, lane);
  return typed > 0 ? Math.round((100 * (typed - wrong)) / typed) : 100;
}

function detailOf(race: Race, lane: number) {
  const samples = race.samples[lane] ?? [];
  const typedPerSecond = deltas(samples, (sample) => sample.typed);
  const { typed, wrong, extra, missed } = totalsOf(race, lane);
  const minutes = laneElapsedMs(race, lane) / 60000;
  return {
    raw: minutes > 0.02 ? Math.round(typed / CHARS_PER_WORD / minutes) : 0,
    chars: [Math.round(typed - wrong - extra), Math.round(wrong), Math.round(extra), Math.round(missed)] as PlayerResult["chars"],
    consistency: consistencyOf(typedPerSecond),
    idle: samples.length ? Math.round((1000 * typedPerSecond.filter((value) => value === 0).length) / samples.length) / 10 : 0,
    wpmSeries: samples.map((sample, i) => Math.round((sample.chars / CHARS_PER_WORD) * (60 / (i + 1)))),
    rawSeries: typedPerSecond.map((value) => Math.round((value * 60) / CHARS_PER_WORD)),
    errorSeries: deltas(samples, (sample) => sample.errors).map(Math.round),
  };
}

/** Les joueurs dans l'ordre final : les arrivées, puis les autres selon leur avancée. */
export function buildResults(race: Race, players: Player[]): PlayerResult[] {
  const others = players
    .map((_, lane) => lane)
    .filter((lane) => !race.arrivals.includes(lane))
    .sort((a, b) => laneProgress(race, b) - laneProgress(race, a));
  return [...race.arrivals, ...others].map((lane) => {
    const mine = lane === race.myLane;
    return {
      name: players[lane]!.name,
      me: !!players[lane]!.me,
      bot: !!players[lane]!.bot,
      wpm: laneWpm(race, lane),
      accuracy: accuracyOf(race, lane),
      seconds: Math.round(laneElapsedMs(race, lane) / 1000),
      finished: race.arrivals.includes(lane),
      eliminated: mine && race.eliminated,
      ...detailOf(race, lane),
    };
  });
}

export function buildSummary(race: Race, room: Room, sessionSeconds: number): RaceSummary {
  const { textType, language, duration, level, punctuation, numbers, specials, accents, excluded, mistakes, botSpeed, botAccuracy, length } = room;
  return { textType, language, duration, level, punctuation, numbers, specials, accents, excluded, mistakes, botSpeed, botAccuracy, length, wordCount: race.course.words.length, sessionSeconds };
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
        bot: !!p.bot,
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

/** Envoie la course au serveur, qui garde l'historique des bots. keepalive : l'envoi survit au passage au podium. */
export function submitRace(results: RaceResults, content: string) {
  fetch("/api/races", {
    method: "POST",
    keepalive: true,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...results, content }),
  }).catch(() => { /* hors ligne : la course n'entre pas dans l'historique */ });
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
