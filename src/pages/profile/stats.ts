// Statistiques globales d'un joueur, lues sur le serveur (AUTH-06).
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
};

/** null : ce joueur n'a encore aucune course enregistrée. */
export async function fetchStats(name: string, signal?: AbortSignal): Promise<PlayerStats | null> {
  const response = await fetch(`/api/players/${encodeURIComponent(name)}/stats`, { signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`stats ${response.status}`);
  return response.json();
}
