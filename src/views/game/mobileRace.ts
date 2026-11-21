"use client";
// DES-06 : sur mobile, la course est remplacée par un message (KeyboardNotice). Ce fichier dit quand on est sur mobile
// et quand ce joueur rejoint le podium comme les autres.
import { useEffect, useSyncExternalStore } from "react";
import { clearResults } from "../podium/results";
import { watchRoom } from "../room/api";
import type { RoomView } from "../room/room";
import { AFTER_LAST_ARRIVAL_MS, COUNT_STEP_MS, GO_MS, RESULTS_DELAY_MS } from "./hooks/useRace";

/** A phone or a touch tablet (coarse pointer, no hover), or a screen too narrow to race. */
export const MOBILE_RACE_QUERY = "(hover: none) and (pointer: coarse), (max-width: 480px)";

export const isMobileRace = () => matchMedia(MOBILE_RACE_QUERY).matches;

const subscribe = (change: () => void) => {
  const list = matchMedia(MOBILE_RACE_QUERY);
  list.addEventListener("change", change);
  return () => list.removeEventListener("change", change);
};

/** True on mobile. The server answers false: the page only shows the room loading there, never the race. */
export function useMobileRace() {
  return useSyncExternalStore(subscribe, isMobileRace, () => false);
}

/** Where the notice sends the player: nowhere while the room races, the podium once it has left the race. */
export const mobileRaceHref = (status: RoomView["status"]) => (status === "racing" ? null : "/podium");

/** Without a server start (no rooms database): a local countdown, the race time, the last arrival, then the results. */
export const mobileRaceDeadlineMs = (durationSeconds: number) => COUNT_STEP_MS * 3 + GO_MS + durationSeconds * 1000 + AFTER_LAST_ARRIVAL_MS + RESULTS_DELAY_MS;

/**
 * COURSE-03: how long the notice waits, from the server time `serverNow`: until the server end (endsAt), then the
 * last arrival and the results delays, as on the race page. Null without time limit (only the server ends the race).
 */
export function mobileRaceDelayMs({ startsAt, endsAt, durationSeconds, serverNow }: { startsAt: number | null; endsAt: number | null; durationSeconds: number | null; serverNow: number }): number | null {
  if (startsAt === null) return durationSeconds === null ? null : mobileRaceDeadlineMs(durationSeconds);
  if (endsAt === null) return null;
  return Math.max(0, endsAt - serverNow) + AFTER_LAST_ARRIVAL_MS + RESULTS_DELAY_MS;
}

type RaceClock = { startsAt: number | null; endsAt: number | null; durationSeconds: number | null; clockOffset: number };

/**
 * The notice follows the room and leaves for the podium when the race ends (results passed by the server).
 * Without news (every human on mobile), it ends the race itself at the deadline, as the race page would.
 */
export function useMobileRaceEnd(code: string, { startsAt, endsAt, durationSeconds, clockOffset }: RaceClock, finish: () => void) {
  useEffect(() => {
    if (!code) return;
    let gone = false;
    const go = () => {
      if (gone) return;
      gone = true;
      clearResults(); // pas de résultats d'une course précédente de cet onglet au podium
      location.replace("/podium");
    };
    const stop = watchRoom(code, (view) => { if (mobileRaceHref(view.status)) go(); }, () => {});
    // CONF-01 : sans limite de temps (null), pas d'échéance ; seul le serveur annonce la fin. COURSE-03 : sinon endsAt.
    const delay = mobileRaceDelayMs({ startsAt, endsAt, durationSeconds, serverNow: Date.now() + clockOffset });
    const timer = delay === null ? undefined : setTimeout(() => {
      finish();
      go();
    }, delay);
    return () => {
      stop();
      if (timer) clearTimeout(timer);
    };
  }, [code, startsAt, endsAt, durationSeconds, clockOffset, finish]);
}
