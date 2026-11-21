import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { latestBatch, type BonusAnnouncement } from "./announce";

// BONUS-03 : l'annonce d'un bonus apparaît d'un coup de tampon (keyframe game-bonus-hit, styles/pages/game/game.css)
export const BONUS_HIT = "animate-[game-bonus-hit_.6s_cubic-bezier(.2,.9,.3,1)_both] motion-reduce:animate-none";

/** Le badge d'un bonus : « +3 mots », « −3 mots », « Brouillard ». */
export const bonusBadge = (t: TFunction, a: BonusAnnouncement) => t(`game.bonus.badge.${a.kind}`, { count: a.count });

/** Ce qu'il dit, sur la piste (`track`, pour tous) ou au joueur ciblé (`mine`). */
export const bonusSentence = (t: TFunction, a: BonusAnnouncement, where: "track" | "mine") =>
  t(`game.bonus.${where}.${a.kind}`, { count: a.count, target: a.target, sender: a.sender ?? t("game.bonus.someone") });

/** BONUS-03 : chez le joueur ciblé, ce qui lui arrive (tout le dernier lot, empilé) ; région annoncée aux lecteurs d'écran, toujours présente. */
export function BonusNotice({ announcements }: { announcements: readonly BonusAnnouncement[] }) {
  const { t } = useTranslation();
  const mine = latestBatch(announcements.filter((a) => a.mine));
  return (
    // posé par la page dans la colonne des avis (GamePage, data-part="game-notices"), sous l'avis de reprise
    <div data-part="bonus-notice" role="status" className="flex max-w-full flex-col gap-1">
      {mine.map((a) => (
        <p key={a.key} className={`flex flex-wrap items-center justify-center gap-x-[1.2ch] gap-y-1 border border-red-text bg-[rgba(0,0,0,.86)] px-4 py-2.5 text-center font-mono text-[max(12px,1.4vh)] leading-[1.5] tracking-[.08em] text-white ${BONUS_HIT}`}>
          <b className="bg-red-solid px-[.6ch] font-medium whitespace-nowrap" data-cue={a.kind}>{bonusBadge(t, a)}</b>
          <span>{bonusSentence(t, a, "mine")}</span>
        </p>
      ))}
    </div>
  );
}
