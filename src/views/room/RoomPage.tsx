import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlipButton } from "../../components/buttons/FlipButton";
import { HangingButton } from "../../components/buttons/HangingButton";
import { Stamp } from "../../components/Stamp";
import { LanguageSwitcher } from "../../components/tabs/LanguageSwitcher";
import { useRealtimeRoom } from "../../realtime/useRealtimeRoom";
import { FishPond } from "./FishPond";
import { LiveList } from "./LiveList";
import { useRoom } from "./hooks/useRoom";
import { isPlayer, raceHref } from "./room";
import { RoomIntro } from "./RoomIntro";
import { RoomSettings } from "./RoomSettings";
import { RoomTicket } from "./RoomTicket";
import { TextEditorDialog, type TextEditorHandle } from "./TextEditorDialog";
import { ACTION, DASHED_TOP, LABEL, SHADE } from "./styles";

const VISIBILITY_KEY = { private: "private", semi: "semiPrivate", public: "public" } as const;

/** Waiting room: the host sets up the race, a guest sees the settings read-only. */
export function RoomPage() {
  const { t } = useTranslation();
  const state = useRoom();
  const { room, update, host, seats, players, spectators, displayName, ready, error, watchInstead, elsewhere, leave, others, kick, status, finished, launch: launchOnServer } = state;
  const editor = useRef<TextEditorHandle>(null);
  const launched = useRef(false);
  const [stampOn, setStampOn] = useState(false);
  // TECH-06 : les personnes présentes dans ce salon, en direct
  const { state: live } = useRealtimeRoom(room.code || null);

  useEffect(() => {
    document.title = t("room.pageTitle");
  }, [t]);

  // SALLE-09 : le salon est lancé (par l'hôte, ou avant un rechargement) : chaque membre rejoint la course
  const race = raceHref(status, room.code, finished);
  useEffect(() => {
    if (race && !launched.current) location.replace(race);
  }, [race]);

  async function launch() {
    if (launched.current) return;
    launched.current = true;
    // SALLE-09 : le serveur passe le salon en course ; à BRANCHER (COURSE-*) : le départ de la partie elle-même
    if (!(await launchOnServer())) {
      launched.current = false;
      return;
    }
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced) setStampOn(true);
    const href = raceHref("racing", room.code)!;
    setTimeout(() => { location.href = href; }, reduced ? 0 : 800);
  }

  const openEditor = () => editor.current?.open();
  const enough = players.length >= 2;

  // le salon vient du serveur : rien à montrer tant qu'il n'a pas répondu, ou s'il refuse
  if (!ready) {
    return (
      <main className="relative z-1 isolate">
        <div className={`${SHADE} mt-[clamp(20px,4vh,36px)] max-w-[640px]`} role={error ? "alert" : "status"}>
          <p>{t(error ? `room.errors.${error}` : "room.loading", elsewhere ? { code: elsewhere.code } : undefined)}</p>
          {error && <HangingButton className="room-leave" href="/home#rooms">{t("room.leave")}</HangingButton>}
          {watchInstead && <button type="button" className={`${ACTION} mt-3 ml-3 min-h-[42px]`} onClick={watchInstead}>{t("room.watchInstead")}</button>}
          {elsewhere && (
            <>
              <button type="button" className={`${ACTION} mt-3 ml-3 min-h-[42px]`} onClick={elsewhere.leave}>{t("room.leaveCurrent", { code: elsewhere.code })}</button>
              <a className={`${ACTION} mt-3 ml-3 min-h-[42px]`} href={`/room?code=${elsewhere.code}`}>{t("room.backToCurrent", { code: elsewhere.code })}</a>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <>
      <FishPond players={players} />
      <LanguageSwitcher className="absolute top-0 right-[clamp(16px,4vw,56px)] z-20 flex items-start gap-2" />
      <Stamp className="room-stamp" label={t("home.stampPlay")} visible={stampOn} playKey={0} />

      <header className="relative z-1 isolate mb-[clamp(20px,4vh,40px)] flex flex-wrap items-center justify-between gap-x-6 gap-y-3 pr-[124px] phone:mb-[14px] phone:pr-0">
        <HangingButton className="room-leave" href={host ? "/home" : "/home#rooms"} onClick={leave}>
          {t("room.leave")}
        </HangingButton>
        <div className={`${SHADE} text-right phone:w-full`}>
          <h1 className="font-sans text-[clamp(20px,3.4vh,32px)] leading-[1.1] font-light tracking-[.1em]">{displayName}</h1>
          <p className="mt-2 font-mono text-[max(11px,1.3vh)] leading-none font-normal tracking-[.2em] text-muted uppercase">{`${t(host ? "room.host" : "room.guest")} · ${t(`room.${VISIBILITY_KEY[room.visibility]}`)}`}</p>
        </div>
      </header>

      <main className="relative z-1 isolate">
        <form
          className="grid grid-cols-[minmax(0,1fr)_minmax(240px,280px)] grid-rows-[auto_1fr] [align-items:start] gap-x-[clamp(20px,3vw,48px)] [grid-template-areas:'left_preview'_'settings_preview'] phone:grid-cols-[minmax(0,1fr)] phone:grid-rows-none phone:[grid-template-areas:'left'_'settings'_'preview']"
          noValidate
          onSubmit={(e) => e.preventDefault()}>
          <RoomIntro state={state} />
          <RoomTicket state={state} />
          <RoomSettings
            state={state}
            onEditText={openEditor}
            action={
              <div className="room-action fixed right-[clamp(16px,4vw,56px)] bottom-[clamp(16px,3vh,28px)] z-5 w-[min(300px,calc(100vw-32px))] phone:mt-0.5 narrow:right-4 narrow:bottom-[14px] narrow:left-4 narrow:w-auto">
                <FlipButton label={t("room.start")} backLabel={t("room.startBack")} disabled={!enough} hidden={!host} onClick={launch} />
                <p className="mt-2 bg-black font-mono text-[max(11px,1.2vh)] leading-[1.5] font-normal text-muted" hidden={!host || enough}>{t("room.notEnough")}</p>
                <p
                  className="flex min-h-[max(46px,6.2vh)] items-center justify-center border border-dashed border-line-soft bg-black px-3 py-2 text-center font-mono text-[max(12px,1.4vh)] leading-[1.3] font-normal tracking-[.1em] text-muted"
                  role="status"
                  hidden={host}>{t("room.waiting")}</p>
              </div>
            }
          />
        </form>
        <LiveList state={live} className={`${SHADE} ${DASHED_TOP} mt-[clamp(24px,4vh,40px)] max-w-[640px] pt-[clamp(16px,2.6vh,24px)]`} />
        <TextEditorDialog ref={editor} text={room.text} onUse={(text) => update({ text, textType: "custom" })} />
        {host && others.length > 0 && (
          <section className={`${SHADE} mt-[clamp(20px,3.4vh,36px)] max-w-[640px]`} aria-labelledby="members-title">
            <h2 id="members-title" className={LABEL}>{t("room.members")}</h2>
            <ul className="mt-2">
              {others.map((m) => (
                <li key={m.key} className="flex flex-wrap items-center gap-x-3.5 gap-y-1 border-b border-dashed border-line-soft py-1.5">
                  <span className="min-w-[8em] flex-1 font-sans text-[max(14px,1.7vh)] leading-[1.3] text-white [overflow-wrap:anywhere]">{m.name}</span>
                  <span className="font-mono text-[max(11px,1.2vh)] leading-none tracking-[.16em] text-muted uppercase">{t(`room.role_${m.role}`)}</span>
                  <button type="button" className={`${ACTION} min-h-[36px]`} onClick={() => confirm(t("room.kickConfirm", { name: m.name })) && void kick(m.key)}>
                    {t("room.kick")}
                    <span className="sr-only">{` ${m.name}`}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="sr-only" aria-labelledby="players-title">
          <h2 id="players-title">{t("room.players")}</h2>
          {/* la liste reste lue par les lecteurs d'écran ; à l'écran, les joueurs sont les poissons */}
          <ol>
            {seats.map((seat, i) => (
              <li key={i}>
                {isPlayer(seat)
                  ? [seat.name, seat.host ? t("room.host") : "", seat.me ? t("room.you") : "", seat.bot ? t("room.bot") : ""].filter(Boolean).join(", ")
                  : t("room.freeSeat")}
              </li>
            ))}
          </ol>
          {spectators.length > 0 && (
            <>
              <h3>{t("room.spectators")}</h3>
              <ul>
                {spectators.map((m) => (
                  <li key={m.key}>{[m.name, m.host ? t("room.host") : ""].filter(Boolean).join(", ")}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      </main>
    </>
  );
}
