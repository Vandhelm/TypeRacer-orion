import { useEffect, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { HangingButton } from "../../components/buttons/HangingButton";
import { buildResults, buildSummary, markSessionStart, saveResults, sessionSeconds, submitRace } from "../podium/results";
import { useRoom } from "../room/hooks/useRoom";
import { rememberGuestRace } from "../profile/stats";
import { useRealtimeRoom } from "../../realtime/useRealtimeRoom";
import { LiveList } from "../room/LiveList";
import { useRace } from "./hooks/useRace";
import { loadRacePoolImages, type RacePoolImages } from "./pool/createRacePool";
import { laneProgress, myWpm } from "./race";
import { RacePool } from "./RacePool";
import { TypingPanel } from "./TypingPanel";

/** The race: one lane per player and the shared text. It hands over to the podium at the end. */
// One row per area: header, pool, names, typing panel. Compact screens scroll and put "Leave" beside the header.
const ROOT =
  "relative grid h-screen grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto_auto] gap-[2vh] overflow-hidden bg-black px-[3vw] pt-[30px] pb-[3vh] font-sans text-white " +
  "compact:h-auto compact:min-h-screen compact:grid-cols-[auto_minmax(0,1fr)] compact:grid-rows-[auto_max(52vh,280px)_auto_auto] compact:overflow-visible compact:px-3 compact:pt-[30px] compact:pb-7";
// The room name, centered, after a red diamond
const TITLE =
  "absolute top-1/2 left-1/2 flex items-center gap-3 font-sans text-[clamp(15px,2.2vh,20px)] leading-[1.1] font-light tracking-[.14em] whitespace-nowrap uppercase [transform:translate(-50%,-50%)] narrow:hidden " +
  "before:size-[.72em] before:flex-none before:border before:border-[rgba(255,140,120,.4)] before:bg-red before:[transform:rotate(45deg)]";
const NAME_LINE = "flex max-w-full items-center overflow-hidden font-mono text-[max(10px,1.2vh)] leading-[1.2] tracking-[.1em] whitespace-nowrap";
// The countdown hits like a stamp (keyframe game-count-hit in styles/pages/game/game.css)
const COUNT = "leading-none tracking-[.02em] animate-[game-count-hit_.8s_cubic-bezier(.2,.9,.3,1)_both] motion-reduce:animate-none";

export function GamePage() {
  const { t } = useTranslation();
  const { room, players, displayName } = useRoom();
  const [images, setImages] = useState<RacePoolImages | null>(null);
  const { race, onInput, showResults } = useRace(room, players, images !== null);

  // TECH-06 : ma progression part dans le salon (10 envois par seconde au plus), celle des autres arrive en direct
  const { state: live, sendProgress } = useRealtimeRoom(room.code || null);
  const mine = laneProgress(race, race.myLane);
  const wpm = myWpm(race);
  useEffect(() => {
    if (race.phase !== "countdown") sendProgress(mine, wpm);
  }, [race.phase, mine, wpm, sendProgress]);

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
    const rank = results.players.findIndex((player) => player.me);
    const me = results.players[rank];
    if (me) rememberGuestRace({ at: new Date().toISOString(), wpm: me.wpm, accuracy: me.accuracy, rank: rank + 1, keys: me.keys });
    submitRace(results, race.course.words.join(" "));
    location.replace("/podium"); // le retour arrière ne relance pas une course
  }, [showResults, race, players, room]);

  return (
    <div className={ROOT} style={{ "--lanes": players.length } as CSSProperties}>
      <HangingButton className="game-leave" href="/room">{t("room.leave")}</HangingButton>
      <header className="relative flex min-h-[42px] items-center justify-end compact:col-start-2 compact:row-start-1">
        <h1 className={TITLE}>{displayName}</h1>
        <LiveList state={live} mine={mine} showMe={false} className="game-live relative z-1 w-[min(320px,45vw)] narrow:w-full" />
      </header>

      {images ? <RacePool players={players} images={images} race={race} label={t("game.poolLabel", { count: players.length })} /> : <div className="race-pool" />}

      <div className="grid grid-cols-[repeat(var(--lanes),minmax(0,1fr))] compact:col-[1/-1]" aria-hidden="true">
        {players.map((player, lane) => (
          <div key={player.name} className="@container flex min-w-0 flex-col items-center gap-[.5vh] px-[.6vh] text-center" style={{ "--progress": laneProgress(race, lane) } as CSSProperties}>
            <p className={`${NAME_LINE} ${player.me ? "font-medium text-white" : "font-normal text-muted"}`}>
              <span className="min-w-0 overflow-hidden text-ellipsis [@container(max-width:56px)]:hidden">{player.me ? `${player.name} · ${t("room.you")}` : player.name}</span>
            </p>
            <span className={`block w-[70%] bg-line-faint ${player.me ? "h-0.5" : "h-px"}`}>
              <i className={`block h-full w-[calc(var(--progress)*100%)] transition-[width] duration-500 ease-[ease] motion-reduce:transition-none ${player.me ? "bg-red-text" : "bg-line"}`} />
            </span>
          </div>
        ))}
      </div>

      <TypingPanel race={race} onInput={onInput} lang={room.language} />

      {race.count !== null && images && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-[3vh] bg-[rgba(0,0,0,.82)] p-6" role="status">
          <b key={race.count} className={`${COUNT} ${race.count > 0 ? "font-sans text-[26vh] font-extralight" : "font-serif text-[20vh] font-bold text-red-text"}`} lang={race.count > 0 ? undefined : "ja"}>
            {race.count > 0 ? race.count : "始"}
          </b>
          {race.count <= 0 && <p className="font-mono text-[max(11px,1.4vh)] leading-none font-normal tracking-[.3em] text-muted">{t("game.go")}</p>}
        </div>
      )}
    </div>
  );
}
