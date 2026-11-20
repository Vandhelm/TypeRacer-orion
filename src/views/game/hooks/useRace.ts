import { useEffect, useMemo, useReducer, useState } from "react";
import type { Player, Room } from "../../room/room";
import { seededRandom } from "../../../rooms/text";
import { buildWords } from "../course";
import { advanceBots, applyInput, applyRemote, createCourse, createRace, everyoneDone, TICK_MS, type Race } from "../race";

export const COUNT_STEP_MS = 800;
export const GO_MS = 500;
export const AFTER_LAST_ARRIVAL_MS = 3000; // le temps du dernier repas
export const RESULTS_DELAY_MS = 800;

type Action =
  | { type: "count"; value: number }
  | { type: "start"; now: number }
  | { type: "input"; value: string; now: number }
  | { type: "tick"; now: number; jitters: number[] }
  | { type: "remote"; updates: { lane: number; progress: number; wpm: number }[]; now: number }
  | { type: "finish" };

function reduce(race: Race, action: Action): Race {
  switch (action.type) {
    case "count":
      return { ...race, count: action.value };
    case "start":
      return { ...race, phase: "racing", count: null, startedAt: action.now, now: action.now };
    case "input":
      return applyInput(race, action.value, action.now);
    case "tick":
      return advanceBots(race, action.now, action.jitters);
    case "remote":
      return race.phase === "racing" ? action.updates.reduce((next, { lane, ...update }) => applyRemote(next, lane, update, action.now), race) : race;
    case "finish":
      return { ...race, phase: "done" };
  }
}

/**
 * La course de cette page : décompte, adversaires, fin de partie. Le décompte attend `ready` (images du bassin prêtes).
 * CONF-03 : `passage` est le texte tiré par le serveur en mode cohérent, `seed` sa graine : tous les membres tapent le même texte.
 */
export function useRace(room: Room, players: Player[], ready: boolean, passage: string | null = null, seed: number | null = null) {
  const [race, dispatch] = useReducer(reduce, null, () =>
    createRace(createCourse(buildWords(room, seed === null ? Math.random : seededRandom(seed), passage), room.duration, room.mistakes), players, room.botSpeed, room.botAccuracy),
  );
  const [showResults, setShowResults] = useState(false);
  const { phase } = race;
  const allDone = everyoneDone(race);

  useEffect(() => {
    if (!ready) return;
    const timers = [2, 1, 0].map((value, i) => setTimeout(() => dispatch({ type: "count", value }), COUNT_STEP_MS * (i + 1)));
    timers.push(setTimeout(() => dispatch({ type: "start", now: Date.now() }), COUNT_STEP_MS * 3 + GO_MS));
    return () => timers.forEach(clearTimeout);
  }, [ready]);

  useEffect(() => {
    if (phase !== "racing") return;
    const loop = setInterval(() => {
      dispatch({ type: "tick", now: Date.now(), jitters: players.map(() => Math.random()) });
    }, TICK_MS);
    return () => clearInterval(loop);
  }, [phase, players]);

  useEffect(() => {
    if (!allDone || phase !== "racing") return;
    const timer = setTimeout(() => dispatch({ type: "finish" }), AFTER_LAST_ARRIVAL_MS);
    return () => clearTimeout(timer);
  }, [allDone, phase]);

  useEffect(() => {
    if (phase !== "done") return;
    const timer = setTimeout(() => setShowResults(true), RESULTS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  const onInput = useMemo(() => (value: string) => dispatch({ type: "input", value, now: Date.now() }), []);
  /** COURSE-05 : les progressions reçues en temps réel des autres humains du salon. */
  const onRemote = useMemo(() => (updates: { lane: number; progress: number; wpm: number }[]) => {
    if (updates.length) dispatch({ type: "remote", updates, now: Date.now() });
  }, []);
  return { race, onInput, onRemote, showResults };
}
