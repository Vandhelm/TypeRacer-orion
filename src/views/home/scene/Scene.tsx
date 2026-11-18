import { useLayoutEffect, useRef, type RefObject } from "react";
import { createScene, type SceneApi, type View } from "./createScene";

type SceneProps = {
  initialView: View;
  /** Filled with the scene controls while the component is mounted. */
  apiRef: RefObject<SceneApi | null>;
};

/** Sushi counter background: three stacked canvases driven by createScene(). */
export function Scene({ initialView, apiRef }: SceneProps) {
  const decor = useRef<HTMLCanvasElement>(null);
  const iceCream = useRef<HTMLCanvasElement>(null);
  const front = useRef<HTMLCanvasElement>(null);
  const firstView = useRef(initialView).current;

  // Layout effect: the scene must exist before the parent's view transition runs.
  useLayoutEffect(() => {
    const api = createScene({ decor: decor.current!, iceCream: iceCream.current!, front: front.current! }, { initialView: firstView });
    apiRef.current = api;
    return () => {
      api.destroy();
      apiRef.current = null;
    };
  }, [apiRef, firstView]);

  return (
    <div className="fixed inset-0 bg-black" aria-hidden="true">
      <canvas ref={decor} id="decor" className="absolute inset-0 block size-full" />
      <canvas ref={iceCream} id="ice-cream" className="absolute inset-0 block size-full" />
      <canvas ref={front} id="front-layer" className="absolute inset-0 block size-full" />
    </div>
  );
}
