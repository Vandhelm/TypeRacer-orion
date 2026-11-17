import { useEffect, useState } from "react";
import { fetchStats, type PlayerStats } from "../stats";

export type StatsState = { status: "loading" } | { status: "ready"; stats: PlayerStats | null } | { status: "error" };

/** Les statistiques d'un joueur, chargées depuis l'API. name null : rien à charger (un invité). */
export function usePlayerStats(name: string | null): StatsState {
  const [state, setState] = useState<StatsState>({ status: "loading" });

  useEffect(() => {
    if (name === null) return;
    const controller = new AbortController();
    setState({ status: "loading" });
    fetchStats(name, controller.signal)
      .then((stats) => setState({ status: "ready", stats }))
      .catch((error) => { if (!controller.signal.aborted) { console.error(error); setState({ status: "error" }); } });
    return () => controller.abort();
  }, [name]);

  return state;
}
