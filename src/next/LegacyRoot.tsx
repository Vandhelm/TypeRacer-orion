"use client";
// Chargé seulement dans le navigateur (voir LegacyPage) : i18n et les pages lisent document, window et
// sessionStorage dès leur import.
import { lazy, StrictMode, Suspense, type ComponentType } from "react";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n";
import { setPlayerName } from "../players/nickname";

export type LegacyPageName = "home" | "room" | "game" | "podium" | "profile";

// Une page = un morceau de code chargé à part : /room ne télécharge pas le code de /game.
const pages: Record<LegacyPageName, ComponentType> = {
  home: lazy(() => import("../views/home/HomePage").then((m) => ({ default: m.HomePage }))),
  room: lazy(() => import("../views/room/RoomPage").then((m) => ({ default: m.RoomPage }))),
  game: lazy(() => import("../views/game/GamePage").then((m) => ({ default: m.GamePage }))),
  podium: lazy(() => import("../views/podium/PodiumPage").then((m) => ({ default: m.PodiumPage }))),
  profile: lazy(() => import("../views/profile/ProfilePage").then((m) => ({ default: m.ProfilePage }))),
};

export default function LegacyRoot({ name, player, guest }: { name: LegacyPageName; player?: string; guest?: boolean }) {
  setPlayerName(player ?? null, guest ?? false);
  const Page = pages[name];
  return (
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <div id="root">
          <Suspense fallback={null}>
            <Page />
          </Suspense>
        </div>
      </I18nextProvider>
    </StrictMode>
  );
}
