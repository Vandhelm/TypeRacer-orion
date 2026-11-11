import { useLayoutEffect, useRef, type RefObject } from "react";
import { flushSync } from "react-dom";
import type { SceneApi, View } from "../scene/createScene";

type Targets = {
  scene: RefObject<SceneApi | null>;
  panel: RefObject<HTMLElement | null>;
  back: RefObject<HTMLElement | null>;
  tickets: () => HTMLElement[];
  /** Keeps the home view visible while it animates out / in (.home.leaving). */
  setLeaving: (on: boolean) => void;
  /** Plays the tickets' "slide down" entrance (.ticket.descend). */
  setDescending: (on: boolean) => void;
};

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Home <-> Rooms, in the same page.
 * Le tapis emporte la crème glacée vers la droite pendant que les tickets descendent
 * du plafond ; au retour, les tickets remontent et le tapis ramène la crème glacée
 * en roulant vers la gauche. Timed choreography: inline styles are driven through refs,
 * the visible state (classes) through React state.
 */
export function useViewTransition(view: View, targets: Targets) {
  const shown = useRef<View>("home");
  const mounted = useRef(false);
  const pending = useRef<number>(undefined);
  const latest = useRef(targets);
  latest.current = targets;

  // Layout effect: classes and inline styles change in the same frame, before paint.
  useLayoutEffect(() => {
    const animate = mounted.current;
    mounted.current = true;
    if (view === shown.current) return;
    shown.current = view;
    clearTimeout(pending.current);

    const { scene, panel: panelRef, back: backRef, tickets, setLeaving, setDescending } = latest.current;
    const root = document.documentElement;
    const panel = panelRef.current!, back = backRef.current!, api = scene.current!;
    const resetTickets = () =>
      tickets().forEach((c) => {
        c.style.transition = "";
        c.style.transform = "";
        c.style.opacity = "";
      });

    if (view === "rooms") {
      resetTickets();
      setDescending(false);
      if (!animate || reducedMotion()) {
        root.classList.add("rooms-view");
        api.setCounter(0, 1);
        api.setIceCreamOpacity(0);
        panel.style.opacity = "0";
        return;
      }
      // le menu s'efface
      panel.style.animation = "none";
      panel.style.transition = "opacity .3s ease-in, transform .35s ease-in";
      panel.style.opacity = "0";
      panel.style.transform = "translateY(2vh) scale(.98)";
      setLeaving(true);
      root.classList.add("rooms-view");
      void root.offsetWidth;
      // les tickets descendent du plafond, en même temps que le tapis emporte la crème glacée
      setDescending(true);
      back.style.opacity = "0";
      back.style.transition = "opacity .4s .6s";
      requestAnimationFrame(() => { back.style.opacity = ""; });
      api.beltLeave(
        800,
        (k) => api.setIceCreamOpacity(Math.max(0, 1 - Math.max(0, k - 0.3) / 0.6)),
        () => {
          const v = api.beltSpeed * (1 + api.beltAcceleration * 0.64), BRAKE_MS = 500;
          api.beltArrive((v * BRAKE_MS) / 1000 / 2, BRAKE_MS, null, null);
        },
      );
      pending.current = window.setTimeout(() => api.setCounter(0, 600), 500);
      setTimeout(() => flushSync(() => setLeaving(false)), 400);
      return;
    }

    const finish = () => {
      root.classList.remove("rooms-view");
      resetTickets();
      flushSync(() => setDescending(false));
    };
    if (!animate || reducedMotion()) {
      finish();
      api.setCounter(1, 1);
      api.setIceCreamOpacity(1);
      panel.style.opacity = "";
      panel.style.transform = "";
      return;
    }
    // les tickets remontent le long de leurs fils
    back.style.transition = "opacity .25s";
    back.style.opacity = "0";
    setDescending(false);
    tickets().forEach((c, i) => {
      c.style.transition = `transform .6s ${(3 - i) * 0.05}s cubic-bezier(.55,0,.75,.4), opacity .2s ${0.4 + (3 - i) * 0.05}s`;
      requestAnimationFrame(() => {
        c.style.transform = "translateY(-90vh)";
        c.style.opacity = "0";
      });
    });
    // le comptoir revient, et le tapis ramène la crème glacée en roulant vers la gauche
    api.setCounter(1, 500);
    api.setIceCreamOpacity(0);
    setTimeout(() => api.beltArrive(-14, 950, (k) => api.setIceCreamOpacity(Math.min(1, k / 0.35)), null), 150);
    // puis le menu réapparaît
    setTimeout(() => {
      flushSync(() => setLeaving(true));
      panel.style.transition = "opacity .45s ease-out, transform .5s cubic-bezier(.2,.8,.2,1)";
      panel.style.opacity = "";
      panel.style.transform = "";
    }, 650);
    pending.current = window.setTimeout(() => {
      finish();
      flushSync(() => setLeaving(false));
      back.style.opacity = "";
      back.style.transition = "";
    }, 900);
  }, [view]);
}
