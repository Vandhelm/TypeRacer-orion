import { useEffect, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { HangingButton } from "../../components/buttons/HangingButton";
import { buildResults, buildSummary, markSessionStart, saveResults, sessionSeconds, submitRace } from "../podium/results";
import { useRoom } from "../room/hooks/useRoom";
import { useRace } from "./hooks/useRace";
import { loadRacePoolImages, type RacePoolImages } from "./pool/createRacePool";
import { laneProgress } from "./race";
import { RacePool } from "./RacePool";
import { TypingPanel } from "./TypingPanel";

/** The race: one lane per player and the shared text. It hands over to the podium at the end. */
export function GamePage() {
  const { t } = useTranslation();
  const { room, players, displayName } = useRoom();
  const [images, setImages] = useState<RacePoolImages | null>(null);
  const { race, onInput, showResults } = useRace(room, players, images !== null);

  useEffect(markSessionStart, []);

  useEffect(() => {
    document.title = t("game.pageTitle");
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    loadRacePoolImages().then((loaded) => { if (!cancelled) setImages(loaded); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!showResults) return;
    const results = { players: buildResults(race, players), summary: buildSummary(race, room, sessionSeconds()) };
    saveResults(results);
    submitRace(results, race.course.words.join(" "));
    location.replace("/podium"); // le retour arrière ne relance pas une course
  }, [showResults, race, players, room]);

  return (
    <div className="game-root" style={{ "--lanes": players.length } as CSSProperties}>
      <HangingButton className="game-leave" href="/room">{t("room.leave")}</HangingButton>
      <header className="game-header">
        <h1 className="game-title">{displayName}</h1>
      </header>

      {images ? <RacePool players={players} images={images} race={race} label={t("game.poolLabel", { count: players.length })} /> : <div className="race-pool" />}

      <div className="game-names" aria-hidden="true">
        {players.map((player, lane) => (
          <div key={player.name} className={player.me ? "game-name is-me" : "game-name"} style={{ "--progress": laneProgress(race, lane) } as CSSProperties}>
            <p className="game-name-line"><span>{player.me ? `${player.name} · ${t("room.you")}` : player.name}</span></p>
            <span className="game-progress"><i /></span>
          </div>
        ))}
      </div>

      <TypingPanel race={race} onInput={onInput} lang={room.language} />

      {race.count !== null && images && (
        <div className="game-overlay" role="status">
          <b key={race.count} className={race.count > 0 ? "game-count" : "game-count is-go"} lang={race.count > 0 ? undefined : "ja"}>
            {race.count > 0 ? race.count : "始"}
          </b>
          {race.count <= 0 && <p className="game-count-label">{t("game.go")}</p>}
        </div>
      )}
    </div>
  );
}
