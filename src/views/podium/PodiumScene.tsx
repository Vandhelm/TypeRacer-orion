import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { BotTag } from "../../players/BotTag";
import { useCameraTravel } from "./hooks/useCameraTravel";
import { PodiumActions, type AfterRaceControls } from "./PodiumActions";
import { oneDecimal, playerAt, profileHref, rankLabel, type PlayerResult } from "./results";
import { SideFace } from "./SideFace";

const RANKS = [1, 2, 3] as const;
const AVATAR_ORDER = [2, 1, 3] as const;
// le 1er est dans l'axe du point de fuite : ses côtés ne se voient pas
const SIDE_FACES: Partial<Record<(typeof RANKS)[number], string>> = {
  2: "0,0 100,21.4 100,100 0,100",
  3: "0,33.3 100,0 100,100 0,100",
};

/** The 3D set: pyramid, floor, columns, and the top three players on the podium. */
export function PodiumScene({ players, arrived, raceId = null, roomHref = "/home", after }: { players: PlayerResult[]; arrived: boolean; raceId?: number | null; roomHref?: string; after?: AfterRaceControls }) {
  const { t, i18n } = useTranslation();
  const scene = useRef<HTMLDivElement>(null);
  useCameraTravel(scene, arrived);

  const wordsPerSecond = (player: PlayerResult) => oneDecimal(i18n.language, player.wpm / 60);
  // BOT-04 : le libellé accessible d'un bot le dit en toutes lettres (le badge du nom est couvert par aria-label)
  const botSpoken = (player: PlayerResult, label: string) => (player.bot ? `${label} (${t("room.botLabel")})` : label);

  return (
    <div ref={scene} className="podium-scene">
      <div className="podium-layer podium-layer--pyramid" data-depth="6">
        <div className="podium-pyramid" />
      </div>

      <div className="podium-floor" />

      <div className="podium-layer podium-layer--stand" data-depth="4.5">
        <div className="podium-stand" aria-label={t("podium.label")}>
          {RANKS.map((rank) => {
            const player = playerAt(players, rank);
            const side = SIDE_FACES[rank];
            return (
              <div key={rank} className={`podium-block podium-block--${rank}${player ? "" : " pointer-events-none invisible"}`}>
                <span>{rank}</span>
                {player && <a className="podium-name" href={profileHref(players.indexOf(player), raceId)} aria-label={botSpoken(player, t("podium.viewStats", { name: player.name }))}>{player.name}{player.bot && <BotTag className="ml-[.4em] align-middle text-[.8em]" />}</a>}
                <span className="podium-speed">{player && `${wordsPerSecond(player)} ${t("podium.wordsPerSecond")}`}</span>
                {side && <SideFace points={side} />}
                {rank === 1 && (
                  <div className="podium-actions">
                    {/* une course relue ne se rejoue pas ; SALLE-09 / COURSE-11 : l'hôte relance par le salon, où il peut changer les réglages */}
                    {raceId ? (
                      <a className="podium-back" href="/profile#stats">{t("podium.backToHistory")}</a>
                    ) : (
                      <PodiumActions roomHref={roomHref} after={after} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {AVATAR_ORDER.map((rank) => {
          const player = playerAt(players, rank);
          if (!player) return null;
          const label = botSpoken(player, t("podium.avatar", { name: player.name, rank: rankLabel(t, rank), speed: wordsPerSecond(player) }));
          return <a key={rank} className={`podium-avatar podium-avatar--${rank}`} href={profileHref(players.indexOf(player), raceId)} tabIndex={-1} aria-label={label} />;
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
