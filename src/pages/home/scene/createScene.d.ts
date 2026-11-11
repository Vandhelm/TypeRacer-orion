export type View = "home" | "rooms";

export type SceneApi = {
  /** Shows (1) or hides (0) the counter over `ms` milliseconds. */
  setCounter(level: number, ms: number): void;
  /** The belt speeds up to the right. */
  beltLeave(ms: number, onStep?: ((k: number) => void) | null, onDone?: (() => void) | null): void;
  /** The belt arrives already moving (dist < 0: to the left) and slows back to its pace. */
  beltArrive(dist: number, ms: number, onStep?: ((k: number) => void) | null, onDone?: (() => void) | null): void;
  setIceCreamOpacity(opacity: number | string): void;
  beltSpeed: number;
  beltAcceleration: number;
  destroy(): void;
};

export function createScene(
  canvases: { decor: HTMLCanvasElement; iceCream: HTMLCanvasElement; front: HTMLCanvasElement },
  options: { initialView: View },
): SceneApi;
