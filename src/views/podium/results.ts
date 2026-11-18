// Résultats d'une course, confiés par le jeu au podium et aux profils : tout vient de ce que chaque couloir a vraiment tapé pendant la course.
import { CHARS_PER_WORD, laneElapsedMs, laneProgress, laneWpm, myAccuracy, type Race, type Sample } from "../game/race";
import { parseKeys, roundKeys, type KeyCounts } from "../../players/keys";
import type { TFunction } from "i18next";
import type { Player, Room } from "../room/room";

export type PlayerResult = {
  name: string;
  /** Place à l'arrivée, à partir de 1. */
  rank: number;
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
  /** Frappes et fautes par touche (heatmap du clavier). */
  keys: KeyCounts;
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
    keys: roundKeys(lane === race.myLane ? race.keys : (race.bots.find((bot) => bot.lane === lane)?.keys ?? {})),
  };
}

/** Les joueurs dans l'ordre final : les arrivées, puis les autres selon leur avancée. */
export function buildResults(race: Race, players: Player[]): PlayerResult[] {
  const others = players
    .map((_, lane) => lane)
    .filter((lane) => !race.arrivals.includes(lane))
    .sort((a, b) => laneProgress(race, b) - laneProgress(race, a));
  return [...race.arrivals, ...others].map((lane, index) => {
    const mine = lane === race.myLane;
    return {
      name: players[lane]!.name,
      rank: index + 1,
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
    return toResults(JSON.parse(raw ?? "null"));
  } catch {
    return null;
  }
}

/** Ordre d'arrivée : le rang enregistré s'il y en a un (une course de l'historique), sinon l'ordre reçu. */
const byRank = (players: Record<string, unknown>[]) =>
  players.map((p, index) => ({ p, rank: Number.isInteger(p.rank) && Number(p.rank) >= 1 ? Number(p.rank) : index + 1 })).sort((a, b) => a.rank - b.rank);

/** Des résultats confiés par le jeu (sessionStorage) ou relus sur le serveur (HIST-02), vérifiés champ par champ. */
export function toResults(value: unknown): RaceResults | null {
  try {
    const stored = value as { summary?: unknown; players?: unknown } | null;
    if (!stored || !stored.summary || !Array.isArray(stored.players) || !stored.players.length) return null;
    const players = byRank(stored.players).map(({ p, rank }): PlayerResult => {
      const [correct = 0, wrong = 0, extra = 0, missed = 0] = numbersOf(p.chars);
      return {
        name: String(p.name),
        rank,
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
        keys: parseKeys(p.keys),
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

/** Le corps envoyé au serveur : la course et son identifiant unique, pour que le serveur refuse un rejeu (AUTH-06). */
export function raceBody(results: RaceResults, content: string) {
  return { id: crypto.randomUUID(), ...results, content };
}

/** Envoie la course au serveur, qui garde l'historique des bots et du compte connecté (sa session, pas le corps). keepalive : l'envoi survit au passage au podium. */
export function submitRace(results: RaceResults, content: string) {
  fetch("/api/races", {
    method: "POST",
    keepalive: true,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(raceBody(results, content)),
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

/** Le N-ième joueur de la course affichée ; d'une course de l'historique, raceId la garde (HIST-02). */
export const profileHref = (index: number, raceId?: number | null) => (raceId ? `/profile?race=${raceId}&player=${index}` : `/profile?player=${index}`);

/** Retour au podium de la course affichée, sans nouveau travelling. */
export const podiumHref = (raceId: number | null) => (raceId ? `/podium?race=${raceId}#arrived` : "/podium#arrived");

/** HIST-02 : une course de l'historique s'ouvre sur sa page de résultats. */
export const historyHref = (raceId: number) => `/podium?race=${raceId}`;
export const raceResultsUrl = (raceId: number) => `/api/history/${raceId}`;

/** La course de l'historique demandée par l'adresse (?race=N), ou null : les résultats de la course jouée dans cet onglet. */
export function historyRaceOf(search: string): number | null {
  const value = new URLSearchParams(search).get("race");
  return value && /^[1-9]\d{0,9}$/.test(value) ? Number(value) : null;
}

/** Erreur de chargement d'une course de l'historique : le code du serveur (not_found, unauthorized…) ou "network". */
export class RaceLoadError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export const RACE_ERRORS = ["not_found", "unauthorized", "account_required", "invalid_race", "network"] as const;
/** Le message traduit d'un refus ; un code inconnu devient une erreur réseau. */
export const raceErrorKey = (code: string) => `podium.errors.${(RACE_ERRORS as readonly string[]).includes(code) ? code : "network"}`;

/** Les résultats d'une course de l'historique, relus sur le serveur (HIST-02). */
export async function fetchRaceResults(raceId: number, signal?: AbortSignal): Promise<RaceResults> {
  const response = await fetch(raceResultsUrl(raceId), { signal });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new RaceLoadError(String((body as { error?: unknown } | null)?.error ?? "network"));
  const results = toResults(body);
  if (!results) throw new RaceLoadError("network");
  return results;
}

export const oneDecimal = (language: string, value: number) =>
  new Intl.NumberFormat(language === "en" ? "en-CA" : "fr-CA", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
/** Le joueur classé à ce rang, s'il est connu : une marche du podium reste vide plutôt que d'y monter le suivant. */
export const playerAt = (players: PlayerResult[], rank: number) => players.find((player) => player.rank === rank);

/** Un rang en ordinal traduit (1re, 2e… / 1st, 2nd…), quelle que soit la taille de la salle. */
export const rankLabel = (t: TFunction, rank: number) => t("podium.rank", { count: rank, ordinal: true });
