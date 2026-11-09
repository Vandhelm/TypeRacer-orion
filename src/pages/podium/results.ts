// Résultats d'une course, confiés par le jeu au podium. À BRANCHER : la précision des adversaires est simulée, elle doit venir du serveur de jeu.
import { laneElapsedMs, laneProgress, laneWpm, myAccuracy, type Race } from "../game/race";
import type { BotAccuracy, Player } from "../room/room";

export type PlayerResult = { name: string; me: boolean; wpm: number; accuracy: number; seconds: number };

const RESULTS_KEY = "orion-results";
const BOT_ACCURACY: Record<BotAccuracy, [number, number]> = { shaky: [82, 90], decent: [90, 96], high: [96, 100] };

/** Les joueurs dans l'ordre final : les arrivées, puis les autres selon leur avancée. */
export function buildResults(race: Race, players: Player[], botAccuracy: BotAccuracy, random: () => number = Math.random): PlayerResult[] {
  const [low, high] = BOT_ACCURACY[botAccuracy];
  const others = players
    .map((_, lane) => lane)
    .filter((lane) => !race.arrivals.includes(lane))
    .sort((a, b) => laneProgress(race, b) - laneProgress(race, a));
  return [...race.arrivals, ...others].map((lane) => ({
    name: players[lane]!.name,
    me: !!players[lane]!.me,
    wpm: laneWpm(race, lane),
    accuracy: lane === race.myLane ? myAccuracy(race) : Math.round(low + random() * (high - low)),
    seconds: Math.round(laneElapsedMs(race, lane) / 1000),
  }));
}

export function parseResults(raw: string | null): PlayerResult[] | null {
  try {
    const list: unknown = JSON.parse(raw ?? "null");
    if (!Array.isArray(list) || !list.length) return null;
    return list.map((p) => ({ name: String(p.name), me: !!p.me, wpm: Number(p.wpm) || 0, accuracy: Number(p.accuracy) || 0, seconds: Number(p.seconds) || 0 }));
  } catch {
    return null;
  }
}

export function saveResults(results: PlayerResult[]) {
  try { sessionStorage.setItem(RESULTS_KEY, JSON.stringify(results)); } catch { /* stockage indisponible */ }
}

export function readResults() {
  try { return parseResults(sessionStorage.getItem(RESULTS_KEY)); } catch { return null; }
}

const sample = (name: string, wpm: number, me = false): PlayerResult => ({ name, me, wpm, accuracy: 96, seconds: 45 });
/** Page ouverte sans partie : des joueurs d'exemple. */
export const SAMPLE_RESULTS = [sample("Corail_418", 68, true), sample("Wasabi_77", 61), sample("Nori_203", 54), sample("Thon_Rouge", 47)];
