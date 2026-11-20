"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { HangingButton } from "../../components/buttons/HangingButton";
import { FLOATING_TABS, LanguageSwitcher } from "../../components/tabs/LanguageSwitcher";
import { buildResults, buildSummary, markSessionStart, rememberSubmit, saveResults, sessionSeconds, submitRace } from "../podium/results";
import { useRoom, type RoomState } from "../room/hooks/useRoom";
import { rememberGuestRace } from "../profile/stats";
import { useRealtimeRoom } from "../../realtime/useRealtimeRoom";
import { LiveList } from "../room/LiveList";
import { READY } from "./countdown";
import { useRace } from "./hooks/useRace";
import { AbandonRace } from "./AbandonRace";
import { canAbandon, markAbandoned, raceExit } from "./abandon";
import { KeyboardNotice } from "./KeyboardNotice";
import { useMobileRace } from "./mobileRace";
import { loadRacePoolImages, type RacePoolImages } from "./pool/createRacePool";
import { laneProgress, myWpm } from "./race";
import { RacePool } from "./RacePool";
import { RaceTrack } from "./RaceTrack";
import { myStanding, resumeNotice } from "./resume";
import { raceLanes, remoteUpdates, trackLanes } from "./track";
import { TypingPanel } from "./TypingPanel";

// One row per area: header, pool, names, typing panel. Compact screens scroll and put "Leave" beside the header.
const ROOT =
  "relative grid h-screen grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto_auto] gap-[2vh] overflow-hidden bg-black px-[3vw] pt-[30px] pb-[3vh] font-sans text-white " +
  "compact:h-auto compact:min-h-screen compact:grid-cols-[auto_minmax(0,1fr)] compact:grid-rows-[auto_max(52vh,280px)_auto_auto] compact:overflow-visible compact:px-3 compact:pt-[30px] compact:pb-7";
// The room name, centered, after a red diamond
const TITLE =
  "absolute top-1/2 left-1/2 flex items-center gap-3 font-sans text-[clamp(15px,2.2vh,20px)] leading-[1.1] font-light tracking-[.14em] whitespace-nowrap uppercase [transform:translate(-50%,-50%)] narrow:hidden " +
  "before:size-[.72em] before:flex-none before:border before:border-[rgba(255,140,120,.4)] before:bg-red before:[transform:rotate(45deg)]";
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
  // COURSE-07 : un membre qui a abandonné (dit par le serveur, même après un rechargement) ne revient pas dans la course
  // (handOver : un abandon confirmé ici ; la page garde la course jusqu'à l'envoi des résultats, puis va au podium)
  const [handOver, setHandOver] = useState(false);
  const elsewhere = state.ready && !handOver ? raceExit(state.status, state.room.code, state.abandoned) : null;
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
  return <GameScreen state={state} mobile={mobile} onHandOver={setHandOver} />;
}

/** DES-06 : on mobile the race is never mounted (no pool, no typing field): a notice recommends a physical keyboard. */
export function GameScreen({ state, mobile, onHandOver }: { state: RoomState; mobile: boolean; onHandOver?: (sending: boolean) => void }) {
  return mobile ? <KeyboardNotice state={state} /> : <GameRace state={state} onHandOver={onHandOver} />;
}

/** One lane per player and the shared text. It hands over to the podium at the end. COURSE-05: a spectator watches, without typing panel. */
function GameRace({ state, onHandOver }: { state: RoomState; onHandOver?: (sending: boolean) => void }) {
  const { t } = useTranslation();
  const { room, displayName, finish, leave, passage, seed, startsAt, endsAt, clockOffset } = state;
  const watching = state.role === "spectator";
  // COURSE-05 : les couloirs sont figés au départ ; un membre qui quitte ensuite ne décale ni noms ni progressions
  const [lanes] = useState(() => raceLanes(state.players, state.members ?? []));
  const { players } = lanes;
  const [images, setImages] = useState<RacePoolImages | null>(null);
  const { race, onInput, onRemote, onResume, arrivedMidRace, showResults } = useRace(room, players, { passage, seed, startsAt, endsAt, clockOffset });
  // COURSE-07 : abandon enregistré par le serveur ; la progression ne part plus et la page passe au podium
  const [abandoned, setAbandoned] = useState(false);

  // TECH-06 : ma progression part dans le salon (10 envois par seconde au plus), celle des autres arrive en direct
  const { state: live, sendProgress } = useRealtimeRoom(room.code || null);
  const mine = laneProgress(race, race.myLane);
  const wpm = myWpm(race);
  useEffect(() => {
    if (!watching && !abandoned && race.phase !== "countdown") sendProgress(mine, wpm);
  }, [watching, abandoned, race.phase, mine, wpm, sendProgress]);
  // COURSE-08 : après un rechargement ou une coupure, la page reprend une fois à la progression validée par le serveur ;
  // un abandon par silence (plus de 30 s), dit par le serveur, mène au podium comme un abandon
  const [resumed, setResumed] = useState(false);
  const standing = myStanding(live);
  useEffect(() => {
    if (resumed || !standing || race.phase === "countdown") return;
    onResume(standing);
    setResumed(true);
  }, [resumed, standing, race.phase, onResume]);
  useEffect(() => {
    if (live?.abandoned && !watching) setAbandoned(true);
  }, [live?.abandoned, watching]);
  // COURSE-05 : les autres humains avancent dans leur couloir avec ce qu'ils envoient
  useEffect(() => {
    if (race.phase === "racing") onRemote(remoteUpdates(live, lanes));
  }, [race.phase, live, lanes, onRemote]);

  useEffect(markSessionStart, []);

  useEffect(() => {
    let cancelled = false;
    loadRacePoolImages().then((loaded) => { if (!cancelled) setImages(loaded); });
    return () => { cancelled = true; };
  }, []);

  const submitted = useRef(false);
  useEffect(() => {
    // une seule fois : une frappe ou un salon mis à jour pendant l'envoi relancerait l'effet
    if (!(showResults || abandoned) || submitted.current) return;
    submitted.current = true;
    const built = buildResults(race, players);
    const results = { players: abandoned ? markAbandoned(built) : built, summary: buildSummary(race, room, sessionSeconds()), room: room.code };
    saveResults(results);
    // un spectateur n'a ni course à enregistrer ni salon à terminer : il voit seulement le podium
    if (watching) {
      location.replace("/podium");
      return;
    }
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
  }, [showResults, abandoned, race, players, room, finish, watching]);

  return (
    <div className={ROOT} style={{ "--lanes": players.length } as CSSProperties}>
      <LanguageSwitcher className={FLOATING_TABS} />
      {/* quitter la course quitte le salon ; /room sans code créerait un nouveau salon */}
      <HangingButton className="game-leave" href="/home" onClick={leave}>{t("room.leave")}</HangingButton>
      <header className="relative flex min-h-[42px] items-center justify-end compact:col-start-2 compact:row-start-1">
        {canAbandon(race, watching) && !abandoned && <AbandonRace code={room.code} onSending={onHandOver} onAbandoned={() => setAbandoned(true)} />}
        <h1 className={TITLE}>{displayName}</h1>
        <LiveList state={live} mine={mine} showMe={false} className="game-live relative z-1 w-[min(320px,45vw)] narrow:w-full" />
      </header>

      {images ? <RacePool players={players} images={images} race={race} label={t("game.poolLabel", { count: players.length })} /> : <div className="race-pool" />}

      <RaceTrack lanes={trackLanes(race, players)} />

      {!watching && resumeNotice({ arrivedMidRace, resumed, racing: race.phase === "racing", status: live?.status }) && (
        <p className="pointer-events-none fixed top-[84px] left-1/2 z-30 -translate-x-1/2 font-mono text-[max(11px,1.3vh)] leading-[1.6] tracking-[.12em] text-muted" role="status">
          {t("game.resuming")}
        </p>
      )}

      {watching ? (
        <p className="py-[1.4vh] text-center font-mono text-[max(11px,1.3vh)] leading-[1.6] tracking-[.12em] text-muted compact:col-[1/-1]" role="status">
          {t("game.track.watching")}
        </p>
      ) : (
        <TypingPanel race={race} onInput={onInput} lang={room.language} />
      )}

      {/* COURSE-03 : le décompte suit le départ du serveur, images du bassin prêtes ou non ; « partez » laisse voir le texte */}
      {race.count !== null && (
        <div className={`fixed inset-0 z-40 flex flex-col items-center justify-center gap-[3vh] p-6 ${race.count > 0 ? "bg-[rgba(0,0,0,.82)]" : "pointer-events-none"}`} role="status">
          {race.count === READY ? (
            // COURSE-03 : la préparation, le temps que chacun arrive sur la page avant le « 3 »
            <b className="font-sans text-[8vh] leading-none font-extralight tracking-[.14em] uppercase">{t("game.ready")}</b>
          ) : (
            <b key={race.count} className={`${COUNT} ${race.count > 0 ? "font-sans text-[26vh] font-extralight" : "font-serif text-[20vh] font-bold text-red-text"}`} lang={race.count > 0 ? undefined : "ja"}>
              {race.count > 0 ? race.count : "始"}
            </b>
          )}
          {race.count <= 0 && <p className="font-mono text-[max(11px,1.4vh)] leading-none font-normal tracking-[.3em] text-muted">{t("game.go")}</p>}
        </div>
      )}
    </div>
  );
}
