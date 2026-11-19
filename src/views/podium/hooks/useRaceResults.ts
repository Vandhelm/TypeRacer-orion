import { useEffect, useState } from "react";
import { fetchRaceResults, historyRaceOf, RaceLoadError, readResults, type RaceResults } from "../results";

export type ResultsState =
  | { status: "loading"; raceId: number | null }
  | { status: "ready"; results: RaceResults; raceId: number | null }
  | { status: "missing" }
  | { status: "error"; code: string; raceId: number };

/**
 * Les résultats à afficher : ceux d'une course de l'historique si l'adresse en nomme une (?race=N, HIST-02, relus sur le serveur),
 * sinon ceux de la course jouée dans cet onglet (sessionStorage). "missing" : aucun des deux.
 * search : la query de la page quand le serveur l'a déjà lue ; sinon celle de l'adresse.
 * Le premier rendu est « loading » : le serveur ne voit pas le sessionStorage (TECH-01).
 * preloaded : la course de l'historique que le serveur a déjà lue (ou refusée) ; rien à recharger.
 */
export function useRaceResults(search?: string, preloaded?: ResultsState): ResultsState {
  const [raceId] = useState(() => historyRaceOf(search ?? (typeof location === "undefined" ? "" : location.search)));
  const [state, setState] = useState<ResultsState>(preloaded ?? { status: "loading", raceId });

  useEffect(() => {
    if (preloaded) return;
    if (!raceId) {
      const stored = readResults();
      setState(stored ? { status: "ready", results: stored, raceId: null } : { status: "missing" });
      return;
    }
    const controller = new AbortController();
    fetchRaceResults(raceId, controller.signal)
      .then((results) => setState({ status: "ready", results, raceId }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (!(error instanceof RaceLoadError)) console.error(error);
        setState({ status: "error", code: error instanceof RaceLoadError ? error.code : "network", raceId });
      });
    return () => controller.abort();
    // preloaded ne change pas : il vient du serveur, une fois
  }, [raceId]);

  return state;
}
