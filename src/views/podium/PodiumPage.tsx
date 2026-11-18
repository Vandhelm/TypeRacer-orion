import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PodiumBoard } from "./PodiumBoard";
import { PodiumScene } from "./PodiumScene";
import { keepPresence } from "../room/presence";
import { backToRoomHref, readResults } from "./results";

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

  // SALLE-08 : sur le podium, le membre reste présent dans son salon (sans signe de vie, il en serait retiré)
  const roomCode = stored?.room;
  useEffect(() => (roomCode ? keepPresence(roomCode) : undefined), [roomCode]);

  if (!stored) return null;
  const { players, room } = stored;

  return (
    <>
      <PodiumScene players={players} arrived={arrived} roomHref={backToRoomHref(room)} />
      <PodiumBoard players={players} showPlace arrived={arrived} />
    </>
  );
}
