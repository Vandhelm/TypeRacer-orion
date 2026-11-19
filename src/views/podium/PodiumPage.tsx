import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FLOATING_TABS, LanguageSwitcher } from "../../components/tabs/LanguageSwitcher";
import { useRaceResults } from "./hooks/useRaceResults";
import { PodiumBoard } from "./PodiumBoard";
import { PodiumScene } from "./PodiumScene";
import { raceErrorKey, submitFailed } from "./results";

/** After the race, or for a race of the history (?race=N, HIST-02): the top three on the podium, then every player. */
export function PodiumPage() {
  const { t } = useTranslation();
  const loaded = useRaceResults();
  const [arrived] = useState(() => location.hash === "#arrived"); // de retour d'un profil : pas de nouveau travelling
  const [notSaved] = useState(submitFailed); // le serveur a refusé la course jouée dans cet onglet

  useEffect(() => {
    // pas de course jouée dans cet onglet, ni de course de l'historique : rien à classer
    if (loaded.status === "missing") location.replace("/home");
    else if (loaded.status === "ready") history.replaceState(null, "", `${location.pathname}${location.search}#arrived`);
  }, [loaded.status]);

  useEffect(() => {
    document.title = t("podium.pageTitle");
  }, [t]);

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

  return (
    <>
      <LanguageSwitcher className={FLOATING_TABS} />
      {raceId === null && notSaved ? <p className="fixed top-4 left-1/2 z-20 m-0 w-max max-w-[calc(100vw-32px)] border border-red-text bg-black px-3.5 py-2 text-center font-mono text-[12px] leading-[1.5] font-normal text-white [transform:translateX(-50%)]" role="alert">{t("podium.notSaved")}</p> : null}
      <PodiumScene players={results.players} arrived={arrived} raceId={raceId} />
      <PodiumBoard players={results.players} showPlace arrived={arrived} raceId={raceId} />
    </>
  );
}
