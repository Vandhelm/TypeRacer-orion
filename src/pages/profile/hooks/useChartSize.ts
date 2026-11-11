import { useEffect, useState, type RefObject } from "react";
import { plotHeight } from "../chart";

const MIN_WIDTH = 280;

/** The chart's drawing size: follows its container and the window. */
export function useChartSize(container: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: MIN_WIDTH, plot: 180 });

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => setSize({ width: Math.max(MIN_WIDTH, element.clientWidth), plot: plotHeight(innerWidth, innerHeight) });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      removeEventListener("resize", measure);
    };
  }, [container]);

  return size;
}
