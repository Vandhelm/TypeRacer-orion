import { useEffect, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { HangingButton } from "../../components/buttons/HangingButton";
import { buildResults, buildSummary, markSessionStart, saveResults, sessionSeconds, submitRace } from "../podium/results";
import { useRoom, type RoomState } from "../room/hooks/useRoom";
import { roomHrefOutsideRace } from "../room/room";
import { rememberGuestRace } from "../profile/stats";
import { useRace } from "./hooks/useRace";
import { loadRacePoolImages, type RacePoolImages } from "./pool/createRacePool";
import { laneProgress } from "./race";
import { RacePool } from "./RacePool";
import { TypingPanel } from "./TypingPanel";

/** The race of the launched room (/game?code=…): read back from the server, never created here (SALLE-09). */
export function GamePage() {
  const { t } = useTranslation();
  const state = useRoom("game");

  useEffect(() => {
    document.title = t("game.pageTitle");
  }, [t]);

  // SALLE-09 : pas de course hors du statut « racing » (salle en attente ou déjà aux résultats)
  const elsewhere = state.ready ? roomHrefOutsideRace(state.status, state.room.code) : null;
  useEffect(() => {
    if (elsewhere) location.replace(elsewhere);
  }, [elsewhere]);

  // la course part des réglages et des joueurs du salon : rien à lancer tant que le serveur n'a pas répondu
  if (!state.ready || elsewhere) {
    return (
      <div className="game-root" role={state.error ? "alert" : "status"}>
        <p>{t(state.error ? `room.errors.${state.error}` : "room.loading")}</p>
        {state.error && <HangingButton className="game-leave" href="/home">{t("room.leave")}</HangingButton>}
      </div>
    );
  }
  return <GameRace state={state} />;
}

/** One lane per player and the shared text. It hands over to the podium at the end. */
function GameRace({ state }: { state: RoomState }) {
  const { t } = useTranslation();
  const { room, players, displayName, finish, leave } = state;
  const [images, setImages] = useState<RacePoolImages | null>(null);
  const { race, onInput, showResults } = useRace(room, players, images !== null);

  useEffect(markSessionStart, []);

  useEffect(() => {
    let cancelled = false;
    loadRacePoolImages().then((loaded) => { if (!cancelled) setImages(loaded); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!showResults) return;
    const results = { players: buildResults(race, players), summary: buildSummary(race, room, sessionSeconds()), room: room.code };
    saveResults(results);
    const rank = results.players.findIndex((player) => player.me);
    const me = results.players[rank];
    if (me) rememberGuestRace({ at: new Date().toISOString(), wpm: me.wpm, accuracy: me.accuracy, rank: rank + 1, keys: me.keys });
    submitRace(results, race.course.words.join(" "));
    finish(); // SALLE-09 : le salon passe aux résultats et accepte de nouveau des arrivants
    location.replace("/podium"); // le retour arrière ne relance pas une course
  }, [showResults, race, players, room, finish]);

  return (
    <div className="game-root" style={{ "--lanes": players.length } as CSSProperties}>
      {/* quitter la course quitte le salon ; /room sans code créerait un nouveau salon */}
      <HangingButton className="game-leave" href="/home" onClick={leave}>{t("room.leave")}</HangingButton>
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
