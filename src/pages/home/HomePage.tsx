import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { HangingButton } from "../../components/buttons/HangingButton";
import { HomeIcon, RoomsIcon, TrainingIcon } from "../../components/icons";
import { Navbar } from "../../components/navigation/Navbar";
import { UserMenu } from "../../components/navigation/UserMenu";
import { HomePanel } from "./HomePanel";
import { useHashView } from "./hooks/useHashView";
import { useViewTransition } from "./hooks/useViewTransition";
import { RoomsView, type RoomsViewHandle } from "./RoomsView";
import { Scene } from "./scene/Scene";
import type { SceneApi } from "./scene/createScene";

// Kept as a plain string so Tailwind's scanner sees every class.
const HOME_CLASSES =
  "home pointer-events-none fixed inset-0 z-10 flex items-center justify-center px-4 py-[3.5vh] pt-[calc(var(--navbar-height)+3.5vh)] phone:relative phone:min-h-screen phone:px-4 phone:pt-[104px] phone:pb-10";

/** Home page: Home view (play / account) and Rooms view (tickets), switched with the URL hash. */
export function HomePage() {
  const { t } = useTranslation();
  const view = useHashView();
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

      <Navbar
        className="fixed inset-x-0 top-0 z-20"
        brand="O.R.I.O.N"
        brandHref="#home"
        brandLabel={t("nav.home")}
        links={[
          { href: "#home", label: t("nav.homeLink"), icon: <HomeIcon />, current: view === "home" },
          { href: "#rooms", label: t("nav.rooms"), icon: <RoomsIcon />, current: view === "rooms" },
          { href: "/training", label: t("nav.training"), icon: <TrainingIcon />, soon: t("nav.soon") },
        ]}
        linksLabel={t("nav.main")}
      >
        <UserMenu />
      </Navbar>

      <HangingButton ref={back} href="#home">{t("rooms.back")}</HangingButton>

      <RoomsView ref={rooms} descending={descending} />

      <main className={leaving ? `${HOME_CLASSES} leaving` : HOME_CLASSES}>
        <HomePanel ref={panel} />
      </main>
    </>
  );
}
