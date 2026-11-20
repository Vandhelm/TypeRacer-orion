"use client";
// TECH-01 : rendu côté serveur par app/podium/page.tsx, qui lui passe la course de l'historique (?race=N) déjà lue.
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FLOATING_TABS, LanguageSwitcher } from "../../components/tabs/LanguageSwitcher";
import { useAfterRace } from "./hooks/useAfterRace";
import { useRaceResults, type ResultsState } from "./hooks/useRaceResults";
import { PodiumBoard } from "./PodiumBoard";
import { PodiumScene } from "./PodiumScene";
import { RaceCharts } from "./RaceCharts";
import { backToRoomHref, fetchRoomResults, finalRanking, raceErrorKey, saveResults, submitFailed, withRoomResults, type RaceResults } from "./results";

/** COURSE-10 : relecture des résultats finaux, après un abandon suivi d'un rechargement. */
const REFRESH_MS = 3000;

/** Une course de l'historique lue par le serveur : ses résultats, ou le code du refus. */
export type ServerRace = { raceId: number; results: RaceResults } | { raceId: number; error: string };

const stateOf = (race: ServerRace): ResultsState =>
  "results" in race ? { status: "ready", results: race.results, raceId: race.raceId } : { status: "error", code: race.error, raceId: race.raceId };

/**
 * After the race, or for a race of the history (?race=N, HIST-02): the top three on the podium, then every player.
 * race : la course de l'historique déjà lue par le serveur ; sans elle, la course jouée dans l'onglet (sessionStorage), après le montage.
 */
export function PodiumPage({ race }: { race?: ServerRace }) {
  const { t } = useTranslation();
  const loaded = useRaceResults(race ? `?race=${race.raceId}` : undefined, race && stateOf(race));
  // le hash et le sessionStorage ne se lisent que dans le navigateur. useLayoutEffect : avant la première image,
  // pour que le travelling ne démarre pas quand on revient d'un profil (#arrived).
  const [arrived, setArrived] = useState(false);
  const [notSaved, setNotSaved] = useState(false); // le serveur a refusé la course jouée dans cet onglet
  useLayoutEffect(() => {
    setArrived(location.hash === "#arrived");
    setNotSaved(submitFailed());
  }, []);

  useEffect(() => {
    // pas de course jouée dans cet onglet, ni de course de l'historique : rien à classer
    if (loaded.status === "missing") location.replace("/home");
    else if (loaded.status === "ready") history.replaceState(null, "", `${location.pathname}${location.search}#arrived`);
  }, [loaded.status]);

  useEffect(() => {
    document.title = t("podium.pageTitle");
  }, [t]);

  // SALLE-08 : sur le podium d'une course jouée, le membre reste présent dans son salon (sans signe de vie, il en serait retiré).
  // COURSE-11 : la même relecture dit qui est hôte, suit une relance et une fermeture de la salle.
  const roomCode = loaded.status === "ready" && loaded.raceId === null ? loaded.results.room : undefined;
  const after = useAfterRace(roomCode);

  // COURSE-10 : la course jouée dans l'onglet est reclassée (terminés, non terminés, abandons), avec les abandons notés
  // par le serveur ; une course de l'historique garde les rangs enregistrés par le serveur. Le classement est gardé pour
  // que le profil ouvert depuis le tableau (?player=N) montre le même joueur.
  // Des résultats gardés à l'abandon (provisional, après un rechargement) : une fois la course finie, la dernière course
  // enregistrée pour ce lancement les remplace (état final des autres).
  const [refreshed, setRefreshed] = useState<RaceResults | null>(null);
  const stored = loaded.status === "ready" && loaded.raceId === null ? loaded.results : null;
  const tabResults = refreshed ?? stored;
  const provisional = !!tabResults?.provisional && after.over;
  useEffect(() => {
    if (!provisional || !stored?.room) return;
    let live = true;
    const code = stored.room;
    const read = async () => {
      const recorded = await fetchRoomResults(code);
      if (live && recorded) setRefreshed(withRoomResults(stored, recorded));
    };
    void read();
    const timer = setInterval(() => void read(), REFRESH_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [provisional, stored]);
  const ranked = useMemo(() => (tabResults ? finalRanking(tabResults.players, after.abandoned) : null), [tabResults, after.abandoned]);
  useEffect(() => {
    if (tabResults && ranked) saveResults({ ...tabResults, players: ranked });
  }, [tabResults, ranked]);

  if (loaded.status === "loading") return <p className="grid min-h-screen place-content-center justify-items-center gap-5 p-6 text-center font-mono text-[13px] leading-[1.6] font-normal text-muted" role="status">{t("podium.loading")}</p>;
  if (loaded.status === "error") {
    return (
      <div className="grid min-h-screen place-content-center justify-items-center gap-5 p-6 text-center font-mono text-[13px] leading-[1.6] font-normal text-muted" role="alert">
        <p>{t(raceErrorKey(loaded.code))}</p>
        <a className="border-b border-b-red-text tracking-[.2em] text-white uppercase no-underline hover:text-red-text focus-visible:outline focus-visible:outline-offset-4 focus-visible:outline-white" href="/profile#stats">{t("podium.backToHistory")}</a>
      </div>
    );
  }
  if (loaded.status !== "ready") return null;
  const { results, raceId } = loaded;
  const players = ranked ?? results.players;

  return (
    <>
      <LanguageSwitcher className={FLOATING_TABS} />
      {raceId === null && notSaved ? <p className="fixed top-4 left-1/2 z-20 m-0 w-max max-w-[calc(100vw-32px)] border border-red-text bg-black px-3.5 py-2 text-center font-mono text-[12px] leading-[1.5] font-normal text-white [transform:translateX(-50%)]" role="alert">{t("podium.notSaved")}</p> : null}
      <PodiumScene players={players} arrived={arrived} raceId={raceId} roomHref={backToRoomHref(results.room)} after={after} />
      <PodiumBoard players={players} showPlace arrived={arrived} raceId={raceId} charts={<RaceCharts players={players} />} />
    </>
  );
}
