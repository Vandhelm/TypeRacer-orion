import { useEffect, useState } from "react";
import type { ServerBonus } from "../../../realtime/client";
import { EMPTY_FEED, expireAnnouncements, feedBonuses, nextExpiry, type BonusAnnouncement } from "../announce";
import type { RaceLanes } from "../track";

/**
 * BONUS-03 : les annonces de bonus en cours, une par bonus reçu (RealtimeState.bonuses), retirées à leur échéance.
 * `you` : mon id temps réel, null pour un spectateur (jamais ciblé). La logique est dans announce.ts (feedBonuses).
 */
export function useBonusAnnouncements(bonuses: readonly ServerBonus[] | undefined, lanes: RaceLanes, you: string | null): BonusAnnouncement[] {
  const [feed, setFeed] = useState(EMPTY_FEED);

  useEffect(() => {
    const now = Date.now();
    setFeed((current) => feedBonuses(current, bonuses, lanes, you, now));
  }, [bonuses, lanes, you]);

  const expiry = nextExpiry(feed.list);
  useEffect(() => {
    if (expiry === null) return;
    const timer = setTimeout(() => setFeed((current) => expireAnnouncements(current, Math.max(Date.now(), expiry))),Math.max(0, expiry - Date.now()));
    return () => clearTimeout(timer);
  }, [expiry]);

  return feed.list;
}
