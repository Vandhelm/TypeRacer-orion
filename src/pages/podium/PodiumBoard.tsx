import { useTranslation } from "react-i18next";
import type { PlayerResult } from "./results";

/** Every player in final order, with the local player's place when the results come from a real race. */
export function PodiumBoard({ players, showPlace }: { players: PlayerResult[]; showPlace: boolean }) {
  const { t } = useTranslation();
  const place = showPlace ? players.findIndex((player) => player.me) : -1;
  const me = players[place];
  const wpm = t("game.wpm");

  return (
    <section className="podium-board" aria-labelledby="podium-board-title">
      <header className="podium-board-head">
        <h2 id="podium-board-title" className="podium-board-title">{t("podium.allPlayers", { count: players.length })}</h2>
        {me && (
          <p className="podium-board-place">
            {t("podium.yourPlace")} · <b>{t(`podium.ranks.${place}`)}</b> · {me.wpm} {wpm} · {me.accuracy} % · {me.seconds} s
          </p>
        )}
      </header>
      <ol className="podium-list">
        {players.map((player, index) => (
          <li key={player.name}>
            <div className={player.me ? "podium-row is-me" : "podium-row"}>
              <span>{t(`podium.ranks.${index}`)}</span>
              <span className="podium-row-name">{player.me ? `${player.name} · ${t("room.you")}` : player.name}</span>
              <span className="podium-row-value">{player.wpm} {wpm}</span>
              <span className="podium-row-value">{player.accuracy} %</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
