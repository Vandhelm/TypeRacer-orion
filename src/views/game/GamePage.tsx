"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { HangingButton } from "../../components/buttons/HangingButton";
import { FLOATING_TABS, LanguageSwitcher } from "../../components/tabs/LanguageSwitcher";
import { buildResults, buildSummary, markSessionStart, rememberSubmit, saveResults, sessionSeconds, submitRace } from "../podium/results";
import { useRoom, type RoomState } from "../room/hooks/useRoom";
import { roomHrefOutsideRace } from "../room/room";
import { rememberGuestRace } from "../profile/stats";
import { useRealtimeRoom } from "../../realtime/useRealtimeRoom";
import { LiveList } from "../room/LiveList";
import { useRace } from "./hooks/useRace";
import { KeyboardNotice } from "./KeyboardNotice";
import { useMobileRace } from "./mobileRace";
import { loadRacePoolImages, type RacePoolImages } from "./pool/createRacePool";
import { laneProgress, myWpm } from "./race";
import { RacePool } from "./RacePool";
import { TypingPanel } from "./TypingPanel";

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

/** The race of the launched room (/game?code=…): read back from the server, never created here (SALLE-09). */
export function GamePage() {
  const { t } = useTranslation();
  const state = useRoom("game");
  const mobile = useMobileRace();

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
      <div className="grid min-h-screen place-content-center justify-items-center gap-5 bg-black p-6 text-center font-mono text-[13px] leading-[1.6] text-muted" role={state.error ? "alert" : "status"}>
        <p>{t(state.error ? `room.errors.${state.error}` : "room.loading")}</p>
        {state.error && <HangingButton className="game-leave" href="/home">{t("room.leave")}</HangingButton>}
      </div>
    );
  }
  return <GameScreen state={state} mobile={mobile} />;
}

/** DES-06 : on mobile the race is never mounted (no pool, no typing field): a notice recommends a physical keyboard. */
export function GameScreen({ state, mobile }: { state: RoomState; mobile: boolean }) {
  return mobile ? <KeyboardNotice state={state} /> : <GameRace state={state} />;
}

/** One lane per player and the shared text. It hands over to the podium at the end. */
function GameRace({ state }: { state: RoomState }) {
  const { t } = useTranslation();
  const { room, players, displayName, finish, leave } = state;
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
    let cancelled = false;
    loadRacePoolImages().then((loaded) => { if (!cancelled) setImages(loaded); });
    return () => { cancelled = true; };
  }, []);

  const submitted = useRef(false);
  useEffect(() => {
    // une seule fois : une frappe ou un salon mis à jour pendant l'envoi relancerait l'effet
    if (!showResults || submitted.current) return;
    submitted.current = true;
    const results = { players: buildResults(race, players), summary: buildSummary(race, room, sessionSeconds()), room: room.code };
    saveResults(results);
    const rank = results.players.findIndex((player) => player.me);
    const me = results.players[rank];
    if (me) rememberGuestRace({ at: new Date().toISOString(), wpm: me.wpm, accuracy: me.accuracy, rank: rank + 1, keys: me.keys });
    const sent = submitRace(results, race.course.words.join(" "));
    finish(); // SALLE-09 : le salon passe aux résultats et accepte de nouveau des arrivants
    // le retour arrière ne relance pas une course ; la page attend la réponse (un instant en keepalive), un refus est dit au podium
    void sent.then((outcome) => {
      rememberSubmit(outcome);
      location.replace("/podium");
    });
  }, [showResults, race, players, room, finish]);

  return (
    <div className={ROOT} style={{ "--lanes": players.length } as CSSProperties}>
      <LanguageSwitcher className={FLOATING_TABS} />
      {/* quitter la course quitte le salon ; /room sans code créerait un nouveau salon */}
      <HangingButton className="game-leave" href="/home" onClick={leave}>{t("room.leave")}</HangingButton>
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
