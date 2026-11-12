import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PodiumBoard } from "./PodiumBoard";
import { PodiumScene } from "./PodiumScene";
import { readResults } from "./results";

/** After the race: the top three on the podium, then every player. */
export function PodiumPage() {
  const { t } = useTranslation();
  const [stored] = useState(readResults);
  const [arrived] = useState(() => location.hash === "#arrived"); // de retour d'un profil : pas de nouveau travelling

  useEffect(() => {
    // pas de course jouée dans cet onglet : rien à classer
    if (!stored) location.replace("/home");
    else history.replaceState(null, "", "#arrived");
  }, [stored]);

  useEffect(() => {
    document.title = t("podium.pageTitle");
  }, [t]);

  if (!stored) return null;
  const { players } = stored;

  return (
    <>
      <PodiumScene players={players} arrived={arrived} />
      <PodiumBoard players={players} showPlace arrived={arrived} />
    </>
  );
}
