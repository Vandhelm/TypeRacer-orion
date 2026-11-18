import { useEffect, useRef, type PointerEvent, type RefObject } from "react";

type Body = { th: number; w: number; ry: number; vry: number; lift: number; hovered: boolean };

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Hanging tickets sway with the mouse (soft damped spring).
 * The animation writes transforms straight to the papers through refs, every frame.
 */
export function useTicketSway(papers: RefObject<(HTMLElement | null)[]>, count: number) {
  const bodies = useRef<Body[]>([]);
  const last = useRef<{ x: number | null; t: number }>({ x: null, t: 0 });

  useEffect(() => {
    if (reducedMotion()) return;
    bodies.current = Array.from({ length: count }, () => ({ th: 0, w: 0, ry: 0, vry: 0, lift: 0, hovered: false }));
    let prev = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const dt = Math.min(0.033, (now - prev) / 1000);
      prev = now;
      bodies.current.forEach((c, i) => {
        const p = papers.current[i];
        if (!p) return;
        // ressort souple et bien amorti : quelques oscillations qui s'éteignent
        c.w += (-14 * c.th - 2.6 * c.w) * dt;
        c.th = Math.max(-0.12, Math.min(0.12, c.th + c.w * dt));
        c.vry += (-22 * c.ry - 4.2 * c.vry) * dt;
        c.ry = Math.max(-14, Math.min(14, c.ry + c.vry * dt));
        c.lift += ((c.hovered ? -4 : 0) - c.lift) * Math.min(1, dt * 7);
        if (Math.abs(c.th) + Math.abs(c.w) + Math.abs(c.ry) + Math.abs(c.vry) + Math.abs(c.lift) > 0.002) {
          p.style.transform = `translateY(${c.lift.toFixed(2)}px) rotate(${c.th.toFixed(4)}rad) rotateY(${c.ry.toFixed(2)}deg)`;
        } else if (p.style.transform) {
          p.style.transform = "";
        }
      });
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [papers, count]);

  return {
    /** Put on the tickets container. */
    container: {
      onPointerMove(e: PointerEvent<HTMLElement>) {
        const now = performance.now();
        const { x, t } = last.current;
        if (x !== null && now - t < 80) {
          const vx = (e.clientX - x) / Math.max(8, now - t); // px / ms
          const el = (e.target as Element).closest<HTMLElement>("[data-i]");
          const c = el && bodies.current[Number(el.dataset.i)];
          if (c) {
            c.w += Math.max(-1.2, Math.min(1.2, vx)) * 0.09;
            c.vry += Math.max(-1.2, Math.min(1.2, vx)) * 7;
          }
        }
        last.current = { x: e.clientX, t: now };
      },
      onPointerLeave() {
        last.current.x = null;
      },
    },
    /** Put on each ticket. */
    ticket: (i: number) => ({
      onPointerEnter() {
        const c = bodies.current[i];
        if (c) c.hovered = true;
      },
      onPointerLeave() {
        const c = bodies.current[i];
        if (c) c.hovered = false;
      },
    }),
  };
}
