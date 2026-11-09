import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useCameraTravel } from "./hooks/useCameraTravel";
import type { PlayerResult } from "./results";
import { SideFace } from "./SideFace";

const RANKS = [1, 2, 3] as const;
const AVATAR_ORDER = [2, 1, 3] as const;
// le 1er est dans l'axe du point de fuite : ses côtés ne se voient pas
const SIDE_FACES: Partial<Record<(typeof RANKS)[number], string>> = {
  2: "0,0 100,21.4 100,100 0,100",
  3: "0,33.3 100,0 100,100 0,100",
};

/** The 3D set: pyramid, floor, columns, and the top three players on the podium. */
export function PodiumScene({ players }: { players: PlayerResult[] }) {
  const { t, i18n } = useTranslation();
  const scene = useRef<HTMLDivElement>(null);
  useCameraTravel(scene);

  const speed = new Intl.NumberFormat(i18n.language === "en" ? "en-CA" : "fr-CA", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const wordsPerSecond = (player: PlayerResult) => speed.format(player.wpm / 60);

  return (
    <div ref={scene} className="podium-scene">
      <div className="podium-layer podium-layer--pyramid" data-depth="6">
        <div className="podium-pyramid" />
      </div>

      <div className="podium-floor" />

      <div className="podium-layer podium-layer--stand" data-depth="4.5">
        <div className="podium-stand" aria-label={t("podium.label")}>
          {RANKS.map((rank) => {
            const player = players[rank - 1];
            const side = SIDE_FACES[rank];
            return (
              <div key={rank} className={`podium-block podium-block--${rank}${player ? "" : " is-hidden"}`}>
                <span>{rank}</span>
                <span className="podium-name">{player?.name}</span>
                <span className="podium-speed">{player && `${wordsPerSecond(player)} ${t("podium.wordsPerSecond")}`}</span>
                {side && <SideFace points={side} />}
                {rank === 1 && (
                  <div className="podium-actions">
                    <a className="podium-play" href="game.html">{t("game.playAgain")}</a>
                    <a className="podium-back" href="room.html">{t("game.backToRoom")}</a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {AVATAR_ORDER.map((rank) => {
          const player = players[rank - 1];
          if (!player) return null;
          const label = t("podium.avatar", { name: player.name, rank: t(`podium.ranks.${rank - 1}`), speed: wordsPerSecond(player) });
          return <div key={rank} className={`podium-avatar podium-avatar--${rank}`} role="img" aria-label={label} />;
        })}
        <div className="podium-reflection" aria-hidden="true"><div /><div /><div /></div>
      </div>

      <div className="podium-layer" data-depth="2">
        <div className="podium-column podium-column--far"><SideFace points="0,0 100,12.5 100,100 0,100" /></div>
      </div>
      <div className="podium-layer" data-depth="1.4">
        <div className="podium-column podium-column--near"><SideFace points="0,14.3 100,0 100,100 0,100" /></div>
      </div>
    </div>
  );
}
