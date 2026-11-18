import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlipButton } from "../../components/buttons/FlipButton";
import { HangingButton } from "../../components/buttons/HangingButton";
import { Stamp } from "../../components/Stamp";
import { HangingTabs } from "../../components/tabs/HangingTabs";
import { languages, type Language } from "../../i18n";
import { FishPond } from "./FishPond";
import { useRoom } from "./hooks/useRoom";
import { isPlayer, raceHref } from "./room";
import { RoomIntro } from "./RoomIntro";
import { RoomSettings } from "./RoomSettings";
import { RoomTicket } from "./RoomTicket";
import { TextEditorDialog, type TextEditorHandle } from "./TextEditorDialog";

const LANGUAGE_TABS = (["fr", "en"] as const).map((code) => ({ value: code, label: code.toUpperCase(), ariaLabel: languages[code] }));
const VISIBILITY_KEY = { private: "private", semi: "semiPrivate", public: "public" } as const;

/** Waiting room: the host sets up the race, a guest sees the settings read-only. */
export function RoomPage() {
  const { t, i18n } = useTranslation();
  const state = useRoom();
  const { room, update, host, seats, players, spectators, displayName, ready, error, watchInstead, leave, status, finished, launch: launchOnServer } = state;
  const editor = useRef<TextEditorHandle>(null);
  const launched = useRef(false);
  const [stampOn, setStampOn] = useState(false);

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
        <div className="room-shade room-name" role={error ? "alert" : "status"}>
          <p>{t(error ? `room.errors.${error}` : "room.loading")}</p>
          {error && <HangingButton className="room-leave" href="/home#rooms">{t("room.leave")}</HangingButton>}
          {watchInstead && <button type="button" className="room-refusal-action" onClick={watchInstead}>{t("room.watchInstead")}</button>}
        </div>
      </main>
    );
  }

  return (
    <>
      <FishPond players={players} />
      <HangingTabs
        className="absolute top-0 right-[clamp(16px,4vw,56px)] z-20 flex items-start gap-2"
        ariaLabel={t("home.langChoice")}
        options={LANGUAGE_TABS}
        value={i18n.resolvedLanguage as Language | undefined}
        onChange={(lng) => i18n.changeLanguage(lng)}
      />
      <Stamp className="room-stamp" label={t("home.stampPlay")} visible={stampOn} playKey={0} />

      <header className="relative z-1 isolate mb-[clamp(20px,4vh,40px)] flex flex-wrap items-center justify-between gap-x-6 gap-y-3 pr-[124px] phone:mb-[14px] phone:pr-0">
        <HangingButton className="room-leave" href={host ? "/home" : "/home#rooms"} onClick={leave}>
          {t("room.leave")}
        </HangingButton>
        <div className="room-shade text-right phone:w-full">
          <h1 className="room-title">{displayName}</h1>
          <p className="room-subtitle">{`${t(host ? "room.host" : "room.guest")} · ${t(`room.${VISIBILITY_KEY[room.visibility]}`)}`}</p>
        </div>
      </header>

      <main className={host ? "relative z-1 isolate" : "relative z-1 isolate room-guest"}>
        <form className="room-form" noValidate onSubmit={(e) => e.preventDefault()}>
          <RoomIntro state={state} />
          <RoomTicket state={state} />
          <RoomSettings
            state={state}
            onEditText={openEditor}
            action={
              <div className="room-action">
                <FlipButton label={t("room.start")} backLabel={t("room.startBack")} disabled={!enough} hidden={!host} onClick={launch} />
                <p className="room-missing" hidden={!host || enough}>{t("room.notEnough")}</p>
                <p className="room-waiting" role="status" hidden={host}>{t("room.waiting")}</p>
              </div>
            }
          />
        </form>
        <TextEditorDialog ref={editor} text={room.text} onUse={(text) => update({ text, textType: "custom" })} />
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
