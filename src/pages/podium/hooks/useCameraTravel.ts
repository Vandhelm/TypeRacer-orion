import { useLayoutEffect, type RefObject } from "react";

const MAX_TRAVEL = 1.55; // s'arrête devant le podium
const DELAY_MS = 400;
const DURATION_MS = 2500;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Moves the camera through the scene's [data-depth] layers (depth = distance to the camera). */
export function useCameraTravel(scene: RefObject<HTMLElement | null>, arrived: boolean) {
  useLayoutEffect(() => {
    const root = scene.current;
    if (!root) return;
    const layers = [...root.querySelectorAll<HTMLElement>("[data-depth]")];

    const apply = (travel: number) => {
      for (const layer of layers) {
        const depth = Number(layer.dataset.depth);
        const remaining = depth - travel;
        const opacity = Math.min(1, Math.max(0, (remaining - 0.05) / 0.35)); // s'efface juste avant de passer la caméra
        layer.style.transform = `scale(${depth / Math.max(remaining, 0.05)})`;
        layer.style.opacity = String(opacity);
        layer.style.visibility = opacity === 0 ? "hidden" : "visible";
      }
      root.style.setProperty("--travel", String(travel));
    };

    if (arrived || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      apply(MAX_TRAVEL);
      return;
    }
    let start: number | null = null;
    let frame = 0;
    const step = (now: number) => {
      start ??= now + DELAY_MS;
      const t = Math.min(1, Math.max(0, (now - start) / DURATION_MS));
      apply(ease(t) * MAX_TRAVEL);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    apply(0);
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [scene, arrived]);
}
