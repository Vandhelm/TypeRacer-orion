"use client";
// Chargé seulement dans le navigateur (voir LegacyPage) : les pages lisent encore document, window et
// sessionStorage dès leur import. Les traductions viennent de <I18nProvider> (app/layout.tsx).
import { lazy, StrictMode, Suspense, type ComponentType } from "react";
import { setPlayerName } from "../players/nickname";

export type LegacyPageName = "room" | "game";

// Une page = un morceau de code chargé à part : /room ne télécharge pas le code de /game.
const pages: Record<LegacyPageName, ComponentType> = {
  room: lazy(() => import("../views/room/RoomPage").then((m) => ({ default: m.RoomPage }))),
  game: lazy(() => import("../views/game/GamePage").then((m) => ({ default: m.GamePage }))),
};

export default function LegacyRoot({ name, player, guest }: { name: LegacyPageName; player?: string; guest?: boolean }) {
  setPlayerName(player ?? null, guest ?? false);
  const Page = pages[name];
  return (
    <StrictMode>
      <div id="root">
        <Suspense fallback={null}>
          <Page />
        </Suspense>
      </div>
    </StrictMode>
  );
}
