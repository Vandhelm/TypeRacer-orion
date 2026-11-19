import { headers } from "next/headers";
import { titleFor } from "../../src/i18n/request";
import { auth, db } from "../../src/server/api";
import { loadHistoryRace } from "../../src/server/history";
import { PodiumPage, type ServerRace } from "../../src/views/podium/PodiumPage";
import { historyRaceOf, toResults } from "../../src/views/podium/results";
import "../../src/styles/pages/podium/index.css";

export const generateMetadata = titleFor("podium");

// TECH-01 : rendue par le serveur. ?race=N (HIST-02) est lue ici, avec les mêmes contrôles que GET /api/history/<id> ;
// sans ?race, la course vient de l'onglet (sessionStorage) et n'arrive qu'après le montage.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).race;
  const raceId = historyRaceOf(typeof raw === "string" ? `?race=${encodeURIComponent(raw)}` : "");
  let race: ServerRace | undefined;
  if (raceId) {
    const loaded = await loadHistoryRace(await headers(), auth(), db(), String(raceId));
    const results = "results" in loaded ? toResults(loaded.results) : null;
    race = results ? { raceId, results } : { raceId, error: "error" in loaded ? loaded.error : "network" };
  }
  return (
    <div id="root">
      <PodiumPage race={race} />
    </div>
  );
}
