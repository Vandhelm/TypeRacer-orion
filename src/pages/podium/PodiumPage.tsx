import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PodiumBoard } from "./PodiumBoard";
import { PodiumScene } from "./PodiumScene";
import { readResults, SAMPLE_RESULTS } from "./results";

/** After the race: the top three on the podium, then every player. */
export function PodiumPage() {
  const { t } = useTranslation();
  const [stored] = useState(readResults);
  const [arrived] = useState(() => location.hash === "#arrived"); // de retour d'un profil : pas de nouveau travelling
  const { players } = stored ?? SAMPLE_RESULTS;

  useEffect(() => {
    history.replaceState(null, "", "#arrived");
  }, []);

  useEffect(() => {
    document.title = t("podium.pageTitle");
  }, [t]);

  return (
    <>
      <PodiumScene players={players} arrived={arrived} />
      <PodiumBoard players={players} showPlace={stored !== null} arrived={arrived} />
    </>
  );
}
