"use client";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { HangingButton } from "../../components/buttons/HangingButton";
import { FLOATING_TABS, LanguageSwitcher } from "../../components/tabs/LanguageSwitcher";

/** DES-06 : a phone or a touch tablet (coarse pointer, no hover), or a screen too narrow to race. */
export const MOBILE_RACE_QUERY = "(hover: none) and (pointer: coarse), (max-width: 480px)";

const subscribe = (change: () => void) => {
  const list = matchMedia(MOBILE_RACE_QUERY);
  list.addEventListener("change", change);
  return () => list.removeEventListener("change", change);
};

/** True on mobile. The server answers false: the page only shows the room loading there, never the race. */
export function useMobileRace() {
  return useSyncExternalStore(subscribe, () => matchMedia(MOBILE_RACE_QUERY).matches, () => false);
}

/** DES-06 : shown instead of the race on mobile. Leaving leaves the room, like the race's own button. */
export function KeyboardNotice({ room, onLeave }: { room: string; onLeave: () => void }) {
  const { t } = useTranslation();
  return (
    <main className="grid min-h-screen place-content-center justify-items-center gap-6 bg-black px-6 py-24 text-center font-sans text-white">
      <LanguageSwitcher className={FLOATING_TABS} />
      <HangingButton className="game-leave" href="/home" onClick={onLeave}>{t("room.leave")}</HangingButton>
      <p className="flex items-center gap-3 font-mono text-[11px] leading-none tracking-[.22em] text-muted uppercase before:size-[.72em] before:flex-none before:border before:border-[rgba(255,140,120,.4)] before:bg-red before:[transform:rotate(45deg)]">
        {room}
      </p>
      <h1 className="max-w-[22ch] text-[clamp(20px,6vw,30px)] leading-[1.2] font-light tracking-[.08em] uppercase">{t("game.keyboard.title")}</h1>
      <p className="max-w-[36ch] font-mono text-[13px] leading-[1.7] text-muted">{t("game.keyboard.body")}</p>
    </main>
  );
}
