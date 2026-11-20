import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Player, Room } from "../../room/room";
import { COUNTDOWN_MS } from "../../../rooms/race-clock";
import { countdownAt, GO_MS, nextChangeIn } from "../countdown";
import { advanceBots, applyInput, applyRemote, endRace, everyoneDone, startRace, TICK_MS, type Race } from "../race";
import { keepsSnapshot, loadSnapshot, markSent, mountRace, restoreSnapshot, resumeRace, saveSnapshot, wasSent, type RaceSnapshot, type ServerStanding } from "../resume";

/** L'ancien décompte local (3 × 800 ms + GO_MS) : seule la page mobile (mobileRace.ts) s'en sert encore pour son échéance. */
export const COUNT_STEP_MS = 800;
export { GO_MS };
export const AFTER_LAST_ARRIVAL_MS = 3000; // le temps du dernier repas
export const RESULTS_DELAY_MS = 800;

type Action =
  | { type: "count"; value: number | null }
  | { type: "start"; now: number }
  | { type: "input"; value: string; now: number }
  | { type: "tick"; now: number }
  | { type: "remote"; updates: { lane: number; progress: number; wpm: number }[]; now: number }
  | { type: "resume"; standing: ServerStanding; startsAt: number; snapshot: RaceSnapshot | null }
  | { type: "restore"; snapshot: RaceSnapshot | null }
  | { type: "finish" };

function reduce(race: Race, action: Action): Race {
  switch (action.type) {
    case "count":
      return { ...race, count: action.value };
    case "start":
      return startRace(race, action.now);
    case "input":
      return applyInput(race, action.value, action.now);
    case "tick":
      return advanceBots(race, action.now);
    case "remote":
      return race.phase === "racing" ? action.updates.reduce((next, { lane, ...update }) => applyRemote(next, lane, update, action.now), race) : race;
    case "finish":
      return endRace(race);
    case "resume":
      return resumeRace(race, action.standing, action.startsAt, action.snapshot);
    case "restore":
      return restoreSnapshot(race, action.snapshot);
  }
}

/** COURSE-03 : le texte tiré par le serveur (CONF-03) et l'horloge de la course (COURSE-06), lus dans la vue du salon. */
export type RaceTiming = {
  /** Le passage tiré par le serveur en mode cohérent. */
  passage?: string | null;
  /** La graine des mots : tous les membres tapent le même texte. */
  seed?: number | null;
  /** Départ et fin, heure du serveur (ms epoch) ; null sans serveur de salons : décompte local de COUNTDOWN_MS. */
  startsAt?: number | null;
  endsAt?: number | null;
  /** Heure du serveur − heure du navigateur (src/views/game/countdown.ts). */
  clockOffset?: number;
};

/**
 * La course de cette page : décompte, adversaires, fin de partie.
 * COURSE-03 : le décompte (3, 2, 1, partez) et l'ouverture de la frappe suivent startsAt du serveur, en heure du serveur
 * (Date.now() + décalage) : tous les membres partent ensemble, et qui arrive en plein décompte voit le bon chiffre.
 * Le minuteur et la fin suivent endsAt (durée = endsAt − startsAt). Toute la course compte en heure du serveur.
 */
export function useRace(room: Room, players: Player[], { passage = null, seed = null, startsAt = null, endsAt = null, clockOffset = 0 }: RaceTiming = {}) {
  const offset = useRef(clockOffset);
  useEffect(() => {
    offset.current = clockOffset;
  }, [clockOffset]);
  const serverNow = useMemo(() => () => Date.now() + offset.current, []);
  // le départ est figé au montage : sans serveur de salons, un décompte local de la même durée
  const [start] = useState(() => startsAt ?? Date.now() + clockOffset + COUNTDOWN_MS);
  // dès le premier affichage : le bon chiffre pour qui arrive ou recharge en plein décompte, la course pour qui arrive après
  // COURSE-08 : bots de la graine de la course, avancés jusqu'à maintenant (src/views/game/resume.ts)
  const [race, dispatch] = useReducer(reduce, null, () => mountRace(room, players, { passage, seed, startsAt, endsAt, start, now: Date.now() + clockOffset }));
  const [showResults, setShowResults] = useState(false);
  const { phase } = race;
  const allDone = everyoneDone(race);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const step = () => {
      const now = serverNow();
      const { count, started } = countdownAt(start, now);
      // le chrono de chacun part de startsAt, même pour qui arrive après le départ
      if (started) dispatch({ type: "start", now: start });
      dispatch({ type: "count", value: count });
      const wait = nextChangeIn(start, now);
      if (wait !== null) timer = setTimeout(step, wait);
    };
    step();
    return () => clearTimeout(timer);
  }, [start, serverNow]);

  useEffect(() => {
    if (phase !== "racing") return;
    const loop = setInterval(() => {
      // BOT-05 : les bots rattrapent le moteur à l'heure serveur, avec la graine du salon : aucun aléa local
      dispatch({ type: "tick", now: serverNow() });
    }, TICK_MS);
    return () => clearInterval(loop);
  }, [phase, serverNow]);

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

  const onInput = useMemo(() => (value: string) => dispatch({ type: "input", value, now: serverNow() }), [serverNow]);
  /** COURSE-05 : les progressions reçues en temps réel des autres humains du salon. */
  const onRemote = useMemo(() => (updates: { lane: number; progress: number; wpm: number }[]) => {
    if (updates.length) dispatch({ type: "remote", updates, now: serverNow() });
  }, [serverNow]);
  // COURSE-08 : mes frappes et fautes de cette course restent dans l'onglet (sessionStorage), pour la reprise
  const { code } = room;
  const { keystrokes, wordIndex, samples } = race;
  const latest = useRef(race);
  useEffect(() => {
    latest.current = race;
  });
  /** COURSE-08 : la course avait déjà commencé quand cette page s'est ouverte (rechargement, retour, arrivée tardive). */
  const [arrivedMidRace] = useState(() => countdownAt(start, Date.now() + clockOffset).started);
  // une page rechargée n'écrase pas ce qu'elle gardait avant d'avoir repris (onResume le relit)
  const [resumed, setResumed] = useState(false);
  useEffect(() => {
    if (keepsSnapshot({ phase, code, arrivedMidRace, resumed })) saveSnapshot(sessionStorage, code, start, latest.current);
  }, [phase, code, start, keystrokes, wordIndex, samples, resumed, arrivedMidRace]);
  /** COURSE-08 : après un rechargement, la page reprend à la progression validée par le serveur (jamais en arrière). */
  const onResume = useMemo(
    () => (standing: ServerStanding) => {
      let snapshot: RaceSnapshot | null = null;
      try {
        snapshot = code ? loadSnapshot(sessionStorage, code, start) : null;
      } catch {
        snapshot = null; // stockage refusé : les mots repris comptent comme justes
      }
      dispatch({ type: "resume", standing, startsAt: start, snapshot });
      setResumed(true);
    },
    [code, start],
  );
  /** COURSE-08 : ce que l'onglet gardait de cette course à son montage (snapshot, déjà envoyée ?), pour remountPlan. */
  const [stored] = useState(() => {
    try {
      return { snapshot: code ? loadSnapshot(sessionStorage, code, start) : null, sent: code ? wasSent(sessionStorage, code, start) : false };
    } catch {
      return { snapshot: null, sent: false };
    }
  });
  /** COURSE-08 : la page remontée après un abandon ou la fin reprend ce qu'elle gardait, pour l'enregistrer. */
  const onRestore = useMemo(() => () => dispatch({ type: "restore", snapshot: stored.snapshot }), [stored]);
  /** COURSE-08 : la course part au serveur : une page remontée ne la renverra pas. */
  const onSent = useMemo(
    () => () => {
      try {
        if (code) markSent(sessionStorage, code, start);
      } catch {
        // stockage refusé : le serveur refuse de toute façon un second enregistrement
      }
    },
    [code, start],
  );
  return { race, onInput, onRemote, onResume, onRestore, onSent, stored, arrivedMidRace, showResults };
}
