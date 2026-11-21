"use client";
import { useTranslation } from "react-i18next";
import { HangingButton } from "../../components/buttons/HangingButton";
import { FLOATING_TABS, LanguageSwitcher } from "../../components/tabs/LanguageSwitcher";
import type { RoomState } from "../room/hooks/useRoom";
import { useMobileRaceEnd } from "./mobileRace";

/** DES-06 : shown instead of the race on mobile. Leaving leaves the room, like the race's own button; the race's end leads to the podium. */
export function KeyboardNotice({ state }: { state: Pick<RoomState, "room" | "displayName" | "leave" | "finish" | "startsAt" | "endsAt" | "clockOffset"> }) {
  const { t } = useTranslation();
  // COURSE-03 : l'échéance suit la fin du serveur (endsAt), en heure du serveur
  const clock = { startsAt: state.startsAt ?? null, endsAt: state.endsAt ?? null, durationSeconds: state.room.duration, clockOffset: state.clockOffset ?? 0 };
  useMobileRaceEnd(state.room.code, clock, state.finish);
  const room = state.displayName;
  const onLeave = state.leave;
  return (
    <main className="grid min-h-screen place-content-center justify-items-center gap-6 bg-black px-6 py-24 text-center font-sans text-white">
      <LanguageSwitcher className={FLOATING_TABS} />
      <HangingButton href="/home" onClick={onLeave}>{t("room.leave")}</HangingButton>
      <p className="flex items-center gap-3 font-mono text-[11px] leading-none tracking-[.22em] text-muted uppercase before:size-[.72em] before:flex-none before:border before:border-red-glow/40 before:bg-red before:[transform:rotate(45deg)]">
        {room}
      </p>
      <h1 className="max-w-[22ch] text-[clamp(20px,6vw,30px)] leading-[1.2] font-light tracking-[.08em] uppercase">{t("game.keyboard.title")}</h1>
      <p className="max-w-[36ch] font-mono text-[13px] leading-[1.7] text-muted">{t("game.keyboard.body")}</p>
    </main>
  );
}
