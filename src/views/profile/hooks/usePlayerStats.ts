import { useEffect, useRef, useState } from "react";
import { fetchStats, type PlayerStats } from "../stats";

export type StatsState = { status: "loading" } | { status: "ready"; stats: PlayerStats | null } | { status: "error" };

/**
 * Les statistiques d'un joueur, chargées depuis l'API. name null : rien à charger (un invité).
 * initial : celles que le serveur a déjà lues pour ce nom (TECH-01) ; undefined : il ne les a pas.
 */
export function usePlayerStats(name: string | null, initial?: PlayerStats | null): StatsState {
  const preloaded = useRef(initial === undefined ? null : { name, stats: initial });
  const [state, setState] = useState<StatsState>(() => (preloaded.current ? { status: "ready", stats: preloaded.current.stats } : { status: "loading" }));

  useEffect(() => {
    if (name === null) return;
    // même nom que celui du serveur : rien à recharger (y compris au double passage du mode strict) ;
    // un autre nom (renommage) rend ces stats caduques pour de bon
    if (preloaded.current?.name === name) return;
    preloaded.current = null;
    const controller = new AbortController();
    setState({ status: "loading" });
    fetchStats(name, controller.signal)
      .then((stats) => setState({ status: "ready", stats }))
      .catch((error) => { if (!controller.signal.aborted) { console.error(error); setState({ status: "error" }); } });
    return () => controller.abort();
  }, [name]);

  return state;
}
