import { useTranslation } from "react-i18next";
import { profileHref, rankLabel, type PlayerResult } from "./results";

/** Every player in final order, with the local player's place when the results come from a real race. */
export function PodiumBoard({ players, showPlace, arrived, raceId = null }: { players: PlayerResult[]; showPlace: boolean; arrived: boolean; raceId?: number | null }) {
  const { t } = useTranslation();
  const me = showPlace ? players.find((player) => player.me) : undefined;
  const wpm = t("game.wpm");

  return (
    <section className={arrived ? "podium-board is-arrived" : "podium-board"} aria-labelledby="podium-board-title">
      <header className="podium-board-head">
        <h2 id="podium-board-title" className="podium-board-title">{t("podium.allPlayers", { count: players.length })}</h2>
        {me && (
          <p className="podium-board-place">
            {t("podium.yourPlace")} · <b>{rankLabel(t, me.rank)}</b> · {me.wpm} {wpm} · {me.accuracy} % · {me.seconds} s
          </p>
        )}
      </header>
      <ol className="podium-list">
        {players.map((player, index) => (
          <li key={player.name}>
            <a className={player.me ? "podium-row is-me" : "podium-row"} href={profileHref(index, raceId)}>
              <span>{rankLabel(t, player.rank)}</span>
              <span className="podium-row-name">{player.me ? `${player.name} · ${t("room.you")}` : player.name}</span>
              <span className="podium-row-value">{player.wpm} {wpm}</span>
              <span className="podium-row-value">{player.accuracy} %</span>
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
