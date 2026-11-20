// COURSE-11 : l'hôte a fermé la salle ; ses membres arrivent ici (/home?roomClosed=1) et le lisent.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { takeRoomClosed } from "../podium/after-race";

export function RoomClosedNotice() {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  // l'adresse ne se lit que dans le navigateur, après le montage ; le paramètre est retiré (un rechargement ne le redit pas)
  useEffect(() => {
    const { closed, search } = takeRoomClosed(location.search);
    if (!closed) return;
    setShown(true);
    history.replaceState(null, "", location.pathname + search + location.hash);
  }, []);
  if (!shown) return null;
  return (
    <p className="fixed top-[calc(var(--navbar-height)+12px)] left-1/2 z-30 m-0 w-max max-w-[calc(100vw-32px)] -translate-x-1/2 border border-red-text bg-black px-3.5 py-2 text-center font-mono text-[12px] leading-[1.5] font-normal text-white" role="status">
      {t("home.roomClosed")}
    </p>
  );
}
