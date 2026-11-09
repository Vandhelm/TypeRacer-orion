import { useEffect, useLayoutEffect, useRef } from "react";
import { createFishPond, type FishPondApi } from "./pond/createFishPond";
import type { Player } from "./room";

/** Background canvas: one fish per player, driven by createFishPond(). */
export function FishPond({ players }: { players: Player[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pond = useRef<FishPondApi | null>(null);

  useLayoutEffect(() => {
    const api = createFishPond(canvas.current!, {
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      noFoodSelector: "a,button,input,label,.room-ticket",
    });
    pond.current = api;
    return () => {
      api.destroy();
      pond.current = null;
    };
  }, []);

  useEffect(() => pond.current?.sync(players), [players]);

  return <canvas ref={canvas} className="fixed inset-0 z-0 block size-full pointer-events-none" aria-hidden="true" />;
}
