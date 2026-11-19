"use client";
// TECH-01 : rendu côté serveur par app/podium/page.tsx, qui lui passe la course de l'historique (?race=N) déjà lue.
import { useEffect, useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "../../components/tabs/LanguageSwitcher";
import { useRaceResults, type ResultsState } from "./hooks/useRaceResults";
import { PodiumBoard } from "./PodiumBoard";
import { PodiumScene } from "./PodiumScene";
import { raceErrorKey, submitFailed, type RaceResults } from "./results";

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

  if (loaded.status === "loading") return <p className="podium-message" role="status">{t("podium.loading")}</p>;
  if (loaded.status === "error") {
    return (
      <div className="podium-message" role="alert">
        <p>{t(raceErrorKey(loaded.code))}</p>
        <a className="podium-message-link" href="/profile#stats">{t("podium.backToHistory")}</a>
      </div>
    );
  }
  if (loaded.status !== "ready") return null;
  const { results, raceId } = loaded;

  return (
    <>
      <LanguageSwitcher className="hanging-tabs-floating" />
      {raceId === null && notSaved ? <p className="podium-notice" role="alert">{t("podium.notSaved")}</p> : null}
      <PodiumScene players={results.players} arrived={arrived} raceId={raceId} />
      <PodiumBoard players={results.players} showPlace arrived={arrived} raceId={raceId} />
    </>
  );
}
