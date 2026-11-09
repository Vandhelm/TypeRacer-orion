import { useEffect, useLayoutEffect, useRef } from "react";
import type { Player } from "../room/room";
import { createRacePool, type RacePoolApi, type RacePoolImages } from "./pool/createRacePool";
import { laneProgress, type Race } from "./race";

const RANK_STAMPS = ["一位", "二位", "三位", "四位", "五位", "六位", "七位", "八位"];

/** The pool: one lane per player, built and animated by createRacePool(). */
export function RacePool({ players, images, race, label }: { players: Player[]; images: RacePoolImages; race: Race; label: string }) {
  const root = useRef<HTMLDivElement>(null);
  const pool = useRef<RacePoolApi | null>(null);

  useLayoutEffect(() => {
    const api = createRacePool(root.current!, { players, images });
    pool.current = api;
    return () => {
      api.destroy();
      pool.current = null;
    };
  }, [players, images]);

  useEffect(() => {
    players.forEach((_, lane) => pool.current?.setProgress(lane, laneProgress(race, lane)));
    race.arrivals.forEach((lane, rank) => pool.current?.finish(lane, RANK_STAMPS[rank]!));
  }, [players, race]);

  return <div ref={root} className="race-pool" role="img" aria-label={label} />;
}
