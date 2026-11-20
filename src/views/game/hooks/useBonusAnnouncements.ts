import { useEffect, useRef, useState } from "react";
import type { ServerBonus } from "../../../realtime/client";
import { activeAnnouncements, newAnnouncements, type BonusAnnouncement } from "../announce";
import type { RaceLanes } from "../track";

/**
 * BONUS-03 : les annonces de bonus en cours, une par bonus reçu (RealtimeState.bonuses), retirées à leur échéance.
 * `you` : mon id temps réel, null pour un spectateur (jamais ciblé).
 */
export function useBonusAnnouncements(bonuses: readonly ServerBonus[] | undefined, lanes: RaceLanes, you: string | null): BonusAnnouncement[] {
  const [list, setList] = useState<BonusAnnouncement[]>([]);
  const seen = useRef(0);

  useEffect(() => {
    const count = bonuses?.length ?? 0;
    // une connexion neuve repart d'une liste vide
    const from = count < seen.current ? 0 : seen.current;
    seen.current = count;
    const now = Date.now();
    const fresh = newAnnouncements(bonuses, from, lanes, you, now);
    if (!fresh.length) return;
    setList((previous) => {
      const shown = new Set(previous.map((a) => a.key));
      return [...activeAnnouncements(previous, now), ...fresh.filter((a) => !shown.has(a.key))];
    });
  }, [bonuses, lanes, you]);

  useEffect(() => {
    if (!list.length) return;
    const next = Math.min(...list.map((a) => a.until));
    const timer = setTimeout(() => setList((previous) => activeAnnouncements(previous, Date.now())), Math.max(0, next - Date.now()));
    return () => clearTimeout(timer);
  }, [list]);

  return list;
}
