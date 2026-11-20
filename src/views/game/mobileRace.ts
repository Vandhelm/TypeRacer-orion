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

/** The race seen from the notice: countdown, race time, the last arrival, then the results, as on the race page. */
export const mobileRaceDeadlineMs = (durationSeconds: number) => COUNT_STEP_MS * 3 + GO_MS + durationSeconds * 1000 + AFTER_LAST_ARRIVAL_MS + RESULTS_DELAY_MS;

/**
 * The notice follows the room and leaves for the podium when the race ends (results passed by the server).
 * Without news (every human on mobile), it ends the race itself at the deadline, as the race page would.
 */
export function useMobileRaceEnd(code: string, durationSeconds: number, finish: () => void) {
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
    const timer = setTimeout(() => {
      finish();
      go();
    }, mobileRaceDeadlineMs(durationSeconds));
    return () => {
      stop();
      clearTimeout(timer);
    };
  }, [code, durationSeconds, finish]);
}
