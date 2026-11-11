// Statistiques globales d'un joueur (AUTH-06) : lues sur le serveur, ou tirées de la session pour un invité.
import { mergeKeys, parseKeys, type KeyCounts } from "../../players/keys";

/** Points du graphique de progression : les dernières courses (comme le serveur). */
const PROGRESS_POINTS = 50;
export type ProgressPoint = { at: string; wpm: number; accuracy: number };
export type PlayerStats = {
  name: string;
  bot: boolean;
  races: number;
  wins: number;
  bestWpm: number | null;
  averageWpm: number | null;
  averageAccuracy: number | null;
  progress: ProgressPoint[];
  /** Frappes et fautes par touche, sur toutes ses courses. */
  keys: KeyCounts;
};

/** null : ce joueur n'a encore aucune course enregistrée. */
export async function fetchStats(name: string, signal?: AbortSignal): Promise<PlayerStats | null> {
  const response = await fetch(`/api/players/${encodeURIComponent(name)}/stats`, { signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`stats ${response.status}`);
  const stats = await response.json();
  return { ...stats, keys: parseKeys(stats.keys) };
}

const GUEST_KEY = "orion-guest-races";
const MAX_GUEST_RACES = 200;
type GuestRace = { at: string; wpm: number; accuracy: number; rank: number; keys?: KeyCounts };

/** Les courses d'un invité, gardées le temps de sa session (cet onglet) : rien n'est enregistré sur le serveur (AUTH-03). */
export function rememberGuestRace(race: GuestRace) {
  try {
    const races = readGuestRaces();
    sessionStorage.setItem(GUEST_KEY, JSON.stringify([...races, race].slice(-MAX_GUEST_RACES)));
  } catch { /* stockage indisponible */ }
}

function readGuestRaces(): GuestRace[] {
  try {
    const stored = JSON.parse(sessionStorage.getItem(GUEST_KEY) ?? "[]");
    return Array.isArray(stored) ? stored.filter((race) => race && Number.isFinite(race.wpm) && Number.isFinite(race.accuracy)) : [];
  } catch {
    return [];
  }
}

/** Les mêmes statistiques que celles du serveur, calculées sur les courses de la session. */
export function guestStats(name: string): PlayerStats {
  const races = readGuestRaces();
  const wpms = races.map((race) => race.wpm);
  const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
  const accuracy = average(races.map((race) => race.accuracy));
  return {
    name,
    bot: false,
    races: races.length,
    wins: races.filter((race) => race.rank === 1).length,
    bestWpm: races.length ? Math.max(...wpms) : null,
    averageWpm: races.length ? Math.round(average(wpms)!) : null,
    averageAccuracy: accuracy === null ? null : Math.round(accuracy * 10) / 10,
    keys: mergeKeys(...races.map((race) => parseKeys(race.keys))),
    progress: races.slice(-PROGRESS_POINTS).map(({ at, wpm, accuracy: acc }) => ({ at, wpm, accuracy: acc })),
  };
}
