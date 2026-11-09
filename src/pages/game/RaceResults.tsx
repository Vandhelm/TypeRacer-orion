import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { OutlineButton } from "../../components/buttons/OutlineButton";
import { laneProgress, myAccuracy, myWpm, type Race } from "./race";

/** End of the race: the player's result, then play again or go back to the room. */
export function RaceResults({ race }: { race: Race }) {
  const { t } = useTranslation();
  const root = useRef<HTMLElement>(null);
  const rank = race.arrivals.indexOf(race.myLane);
  const percent = Math.round(laneProgress(race, race.myLane) * 100);
  const title = rank >= 0
    ? t("game.rankTitle", { rank: t(`game.ranks.${rank}`) })
    : t(race.eliminated ? "game.outTitle" : "game.timeUpTitle", { percent });

  useEffect(() => {
    root.current?.querySelector("a")?.focus();
  }, []);

  return (
    <div className="game-overlay">
      <section ref={root} className="game-results" role="dialog" aria-labelledby="game-results-title">
        <p className="game-results-label">{t("game.result")}</p>
        <h2 id="game-results-title" className="game-results-title">{title}</h2>
        <p className="game-results-stats">{`${myWpm(race)} ${t("game.wpm")} · ${myAccuracy(race)} % ${t("game.accuracy")}`}</p>
        <div className="game-results-actions">
          <OutlineButton href="game.html">{t("game.playAgain")}</OutlineButton>
          <OutlineButton href="room.html">{t("game.backToRoom")}</OutlineButton>
        </div>
      </section>
    </div>
  );
}
