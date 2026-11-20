"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { HangingButton } from "../../components/buttons/HangingButton";
import { FLOATING_TABS, LanguageSwitcher } from "../../components/tabs/LanguageSwitcher";
import { knownAbandons } from "../podium/after-race";
import { buildResults, buildSummary, clearResults, markSessionStart, rememberSubmit, saveResults, sessionSeconds, submitRace, type PlayerResult, type SubmitOutcome } from "../podium/results";
import { roomApi } from "../room/api";
import { useRoom, type RoomState } from "../room/hooks/useRoom";
import { rememberGuestRace } from "../profile/stats";
import { useRealtimeRoom } from "../../realtime/useRealtimeRoom";
import { LiveList } from "../room/LiveList";
import { READY } from "./countdown";
import { useBonusAnnouncements } from "./hooks/useBonusAnnouncements";
import { useRace } from "./hooks/useRace";
import { BonusNotice } from "./BonusNotice";
import { AbandonRace } from "./AbandonRace";
import { bonusesFor, remoteBonuses } from "./bonus";
import { abandonOver, canAbandon, handOverPlayers, raceExit } from "./abandon";
import { KeyboardNotice } from "./KeyboardNotice";
import { useMobileRace } from "./mobileRace";
import { loadRacePoolImages, type RacePoolImages } from "./pool/createRacePool";
import { laneProgress, myWpm, progressReport, raceText } from "./race";
import { RacePool } from "./RacePool";
import { RaceTrack } from "./RaceTrack";
import { myStanding, remountPlan, resumeNotice, resumeStep, staleResults, timeoutAbandon } from "./resume";
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
/** COURSE-10 : après un abandon, la relecture du salon qui guette la fin de la course. */
const ROOM_FOLLOW_MS = 3000;
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
  // COURSE-08 : sauf pour enregistrer d'abord sa course marquée abandon (le serveur l'a laissé entrer : rien d'enregistré)
  const recording = state.abandoned && !mobile && (state.status === "racing" || state.status === "results");
  const elsewhere = state.ready && !handOver && !recording ? raceExit(state.status, state.room.code, state.abandoned) : null;
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
  const { race, onInput, onRemote, onBonus, onResume, onRestore, onSent, stored, arrivedMidRace, showResults } = useRace(room, players, { passage, seed, startsAt, endsAt, clockOffset });
  // COURSE-07 : abandon enregistré par le serveur ; la progression ne part plus et la page passe au podium
  const [abandoned, setAbandoned] = useState(false);
  // COURSE-08 : remontée après un abandon ou après la fin, la page enregistre ce qu'elle gardait, ou va au podium
  const [plan] = useState(() => remountPlan({ abandoned: state.abandoned, phase: race.phase, watching, ...stored }));
  useEffect(() => {
    if (staleResults(plan, stored.sent)) clearResults();
    if (plan === "podium") location.replace("/podium");
    if (plan !== "record") return;
    onRestore();
    if (state.abandoned) setAbandoned(true);
  }, [plan, onRestore, state.abandoned, stored.sent]);

  // TECH-06 : ma progression part dans le salon (10 envois par seconde au plus), celle des autres arrive en direct
  const { state: live, sendProgress } = useRealtimeRoom(room.code || null);
  const mine = laneProgress(race, race.myLane);
  const wpm = myWpm(race);
  // BONUS-04 : avec la longueur de mon texte, pour qu'une progression partie avant un bonus soit recomptée par le serveur
  const { words: myWords } = progressReport(race);
  useEffect(() => {
    if (!watching && !abandoned && race.phase !== "countdown") sendProgress(mine, wpm, myWords);
  }, [watching, abandoned, race.phase, mine, wpm, myWords, sendProgress]);
  // COURSE-08 : après un rechargement ou une coupure, la page reprend une fois à la progression validée par le serveur ;
  // un abandon par silence (plus de 30 s), dit par le serveur, mène au podium comme un abandon
  const [resumed, setResumed] = useState(false);
  const standing = myStanding(live);
  const toResume = resumeStep({ resumed, standing, phase: race.phase });
  useEffect(() => {
    if (!toResume) return;
    onResume(toResume);
    setResumed(true);
  }, [toResume, onResume]);
  const timedOut = timeoutAbandon(live, watching);
  useEffect(() => {
    if (timedOut) setAbandoned(true);
  }, [timedOut]);
  // COURSE-05 : les autres humains avancent dans leur couloir avec ce qu'ils envoient
  useEffect(() => {
    if (race.phase === "racing") onRemote(remoteUpdates(live, lanes));
  }, [race.phase, live, lanes, onRemote]);

  // BONUS-02 : chaque bonus annoncé qui me cible change mon texte ou brouille mes prochains mots, une fois
  const appliedBonuses = useRef(0);
  useEffect(() => {
    const announced = live?.bonuses?.length ?? 0;
    // une connexion neuve repart d'une liste vide
    const from = announced < appliedBonuses.current ? 0 : appliedBonuses.current;
    const you = live?.you?.id ?? null;
    const effects = watching ? [] : bonusesFor(live?.bonuses, from, you);
    appliedBonuses.current = announced;
    // BONUS-03 : la piste suit aussi le texte changé d'un autre humain (le meneur à +3 mots recule)
    onBonus(effects, remoteBonuses(live?.bonuses, from, lanes, watching ? null : you));
  }, [live, watching, onBonus, lanes]);
  // BONUS-03 : chaque bonus est annoncé sur la piste, pour tous, et au joueur qu'il cible
  const announcements = useBonusAnnouncements(live?.bonuses, lanes, watching ? null : (live?.you?.id ?? null));

  useEffect(markSessionStart, []);

  useEffect(() => {
    let cancelled = false;
    loadRacePoolImages().then((loaded) => { if (!cancelled) setImages(loaded); });
    return () => { cancelled = true; };
  }, []);

  // COURSE-10 : mon résultat figé à l'abandon ; la page suit ensuite la course jusqu'à sa fin pour le classement final.
  // Gardé aussitôt (provisoire) : un rechargement entre-temps mène au podium (raceExit), qui relit ensuite l'état final.
  // COURSE-07 : la course part au serveur dès l'abandon ; elle reste enregistrée si le joueur part ou recharge.
  const atAbandon = useRef<PlayerResult | null>(null);
  const abandonSent = useRef<Promise<SubmitOutcome> | null>(null);
  useEffect(() => {
    if (!abandoned || atAbandon.current) return;
    const built = buildResults(race, players);
    atAbandon.current = built.find((player) => player.me) ?? null;
    const results = { players: handOverPlayers(built, true, atAbandon.current), summary: buildSummary(race, room, sessionSeconds()), room: room.code };
    saveResults({ ...results, provisional: true });
    abandonSent.current = submitRace(results, raceText(race));
    void abandonSent.current.then(rememberSubmit);
    finish();
  }, [abandoned, race, players, room, finish]);
  // /game ne suit pas le salon (useRoom) : après l'abandon, la page relit son état pour voir la course finir
  const [roomStatus, setRoomStatus] = useState(state.status);
  useEffect(() => {
    if (!abandoned || !room.code) return;
    let live = true;
    const read = async () => {
      const reply = await roomApi.read(room.code);
      if (live && reply.ok) setRoomStatus(reply.result.room.status);
    };
    void read();
    const timer = setInterval(() => void read(), ROOM_FOLLOW_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [abandoned, room.code]);
  const over = showResults || (abandoned && abandonOver(race, roomStatus));

  const submitted = useRef(false);
  useEffect(() => {
    // une seule fois : une frappe ou un salon mis à jour pendant l'envoi relancerait l'effet
    if (!over || submitted.current) return;
    submitted.current = true;
    const built = buildResults(race, players);
    void (async () => {
      // COURSE-10 : les abandons notés par le serveur (même partis du salon), fusionnés comme sur le podium
      const known = room.code ? knownAbandons(await roomApi.read(room.code)) : [];
      const results = { players: handOverPlayers(built, abandoned, atAbandon.current, known), summary: buildSummary(race, room, sessionSeconds()), room: room.code };
      saveResults(results);
      // un spectateur n'a ni course à enregistrer ni salon à terminer : il voit seulement le podium
      if (watching) {
        location.replace("/podium");
        return;
      }
      const me = results.players.find((player) => player.me);
      if (me) rememberGuestRace({ at: new Date().toISOString(), wpm: me.wpm, accuracy: me.accuracy, rank: me.rank, keys: me.keys });
      // après un abandon, la course est déjà partie (un seul envoi par lancement) : on attend seulement sa réponse
      const sent = abandonSent.current ?? submitRace(results, raceText(race));
      onSent(); // COURSE-08 : une page remontée ensuite ne la renvoie pas
      if (!abandonSent.current) finish(); // SALLE-09 : le salon passe aux résultats et accepte de nouveau des arrivants
      // le retour arrière ne relance pas une course ; la page attend la réponse (un instant en keepalive), un refus est dit au podium
      void sent.then((outcome) => {
        rememberSubmit(outcome);
        location.replace("/podium");
      });
    })();
  }, [over, abandoned, race, players, room, finish, watching, onSent]);

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

      <RaceTrack lanes={trackLanes(race, players)} bonuses={announcements} />

      {/* COURSE-08 et BONUS-03 : la reprise puis l'annonce du bonus qui me cible, empilées dans une même colonne fixe */}
      {!watching && (
        <div data-part="game-notices" className="pointer-events-none fixed top-[84px] left-1/2 z-30 flex w-max max-w-[min(92vw,560px)] -translate-x-1/2 flex-col items-center gap-2">
          {resumeNotice({ arrivedMidRace, resumed, racing: race.phase === "racing", status: live?.status }) && (
            <p className="text-center font-mono text-[max(11px,1.3vh)] leading-[1.6] tracking-[.12em] text-muted" role="status">
              {t("game.resuming")}
            </p>
          )}
          <BonusNotice announcements={announcements} />
        </div>
      )}

      {watching || abandoned ? (
        <p className="py-[1.4vh] text-center font-mono text-[max(11px,1.3vh)] leading-[1.6] tracking-[.12em] text-muted compact:col-[1/-1]" role="status">
          {t(abandoned ? "game.track.abandoned" : "game.track.watching")}
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
