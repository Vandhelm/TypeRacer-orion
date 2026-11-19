import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "../../components/tabs/LanguageSwitcher";
import { useRaceResults } from "./hooks/useRaceResults";
import { PodiumBoard } from "./PodiumBoard";
import { PodiumScene } from "./PodiumScene";
import { keepPresence } from "../room/presence";
import { backToRoomHref, raceErrorKey, submitFailed } from "./results";

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

  // SALLE-08 : sur le podium d'une course jouée, le membre reste présent dans son salon (sans signe de vie, il en serait retiré)
  const roomCode = loaded.status === "ready" && loaded.raceId === null ? loaded.results.room : undefined;
  useEffect(() => (roomCode ? keepPresence(roomCode) : undefined), [roomCode]);

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
      <PodiumScene players={results.players} arrived={arrived} raceId={raceId} roomHref={backToRoomHref(results.room)} />
      <PodiumBoard players={results.players} showPlace arrived={arrived} raceId={raceId} />
    </>
  );
}
