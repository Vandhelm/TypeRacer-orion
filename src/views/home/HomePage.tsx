"use client";
// TECH-01 : rendu côté serveur par app/page.tsx (la coquille, le panneau, les tickets) ; la scène canvas démarre au montage.
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { HangingButton } from "../../components/buttons/HangingButton";
import { SiteNavbar } from "../../components/navigation/SiteNavbar";
import { HomePanel } from "./HomePanel";
import { useHashView } from "./hooks/useHashView";
import { useViewTransition } from "./hooks/useViewTransition";
import { RoomClosedNotice } from "./RoomClosedNotice";
import { RoomsView, type RoomsViewHandle } from "./RoomsView";
import { Scene } from "./scene/Scene";
import type { SceneApi } from "./scene/createScene";

// Kept as a plain string so Tailwind's scanner sees every class.
const HOME_CLASSES =
  "home pointer-events-none fixed inset-0 z-10 flex items-center justify-center px-4 py-[3.5vh] pt-[calc(var(--navbar-height)+3.5vh)] phone:relative phone:min-h-screen phone:px-4 phone:pt-[104px] phone:pb-10";

/** Home page: Home view (play / account) and Rooms view (tickets), switched with the URL hash. me : le compte lu par le serveur. */
export function HomePage({ me = null }: { me?: ComponentProps<typeof HomePanel>["initialMe"] }) {
  const { t } = useTranslation();
  const view = useHashView();
  useEffect(() => {
    document.title = t("home.pageTitle"); // the server title follows the cookie; this one follows a switch without reloading
  }, [t]);
  const [leaving, setLeaving] = useState(false);
  const [descending, setDescending] = useState(false);

  const scene = useRef<SceneApi | null>(null);
  const panel = useRef<HTMLElement>(null);
  const back = useRef<HTMLAnchorElement>(null);
  const rooms = useRef<RoomsViewHandle>(null);

  useViewTransition(view, {
    scene,
    panel,
    back,
    tickets: () => rooms.current?.tickets() ?? [],
    setLeaving,
    setDescending,
  });

  return (
    <>
      <Scene initialView={view} apiRef={scene} />

      <SiteNavbar current={view} me={me} />

      {/* A11Y-02 : un seul <main> et un seul <h1> pour les deux vues (accueil et salons), chacune cachée à son tour.
          Le <main> n'a pas de style : ses enfants sont fixes (ou empilés sur mobile), la mise en page ne change pas. */}
      <main>
        <h1 className="sr-only">{t("home.pageTitle")}</h1>

        <HangingButton ref={back} href="#home">{t("rooms.back")}</HangingButton>

        <RoomClosedNotice />

        <RoomsView ref={rooms} descending={descending} />

        <div className={leaving ? `${HOME_CLASSES} leaving` : HOME_CLASSES}>
          <HomePanel ref={panel} initialMe={me} />
        </div>
      </main>
    </>
  );
}
