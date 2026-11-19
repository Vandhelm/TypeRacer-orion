import { useEffect, useState } from "react";
import { fetchRaceResults, historyRaceOf, RaceLoadError, readResults, type RaceResults } from "../results";

export type ResultsState =
  | { status: "loading"; raceId: number }
  | { status: "ready"; results: RaceResults; raceId: number | null }
  | { status: "missing" }
  | { status: "error"; code: string; raceId: number };

/**
 * Les résultats à afficher : ceux d'une course de l'historique si l'adresse en nomme une (?race=N, HIST-02, relus sur le serveur),
 * sinon ceux de la course jouée dans cet onglet (sessionStorage). "missing" : aucun des deux.
 */
export function useRaceResults(): ResultsState {
  const [raceId] = useState(() => historyRaceOf(location.search));
  const [state, setState] = useState<ResultsState>(() => {
    if (raceId) return { status: "loading", raceId };
    const stored = readResults();
    return stored ? { status: "ready", results: stored, raceId: null } : { status: "missing" };
  });

  useEffect(() => {
    if (!raceId) return;
    const controller = new AbortController();
    fetchRaceResults(raceId, controller.signal)
      .then((results) => setState({ status: "ready", results, raceId }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (!(error instanceof RaceLoadError)) console.error(error);
        setState({ status: "error", code: error instanceof RaceLoadError ? error.code : "network", raceId });
      });
    return () => controller.abort();
  }, [raceId]);

  return state;
}
