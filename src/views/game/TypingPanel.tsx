import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { formatNumber } from "../../i18n/format";
import { elapsedMs, myAccuracy, myWpm, secondsLeft, type Race } from "./race";
import { TypingText } from "./TypingText";

const LOCKED_KEYS = ["Enter", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];

/** Timer, stats and the text itself. The real input is invisible and covers the panel: the player writes "in" the text. */
// The player writes directly in the text: the real input is an invisible layer over the panel.
const PANEL =
  "group game-panel relative grid cursor-text grid-cols-[minmax(0,1fr)_auto] items-center gap-x-[3vw] gap-y-[1.4vh] py-[1.4vh] compact:col-[1/-1] narrow:py-2.5 " +
  "animate-[rise_.8s_.2s_cubic-bezier(.2,.8,.2,1)_both] motion-reduce:animate-none";
const STAT = "flex items-baseline gap-[.7vh]";
const STAT_LABEL = "min-w-0 truncate font-mono text-[max(10px,1.1vh)] leading-none font-normal tracking-[.2em] text-muted";
const STAT_VALUE = "-order-1 font-sans text-[max(18px,2.4vh)] leading-none font-light tracking-[.04em] whitespace-nowrap tabular-nums";

export function TypingPanel({ race, onInput, lang }: { race: Race; onInput: (value: string) => void; lang: string }) {
  const { t, i18n } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const racing = race.phase === "racing";
  const disabled = !racing || race.finishedAt > 0;
  // CONF-01 : sans temps maximal, le chrono compte le temps écoulé au lieu du temps restant
  const left = secondsLeft(race);
  const unlimited = left === null;
  const seconds = left ?? Math.floor(elapsedMs(race) / 1000);
  const target = race.course.words[race.wordIndex] ?? "";
  const wrong = race.typed.length > 0 && !target.startsWith(race.typed);
  const timerPrefix = race.eliminated ? `${t("game.out")} · ` : race.finishedAt ? `${t("game.done")} · ` : "";

  useEffect(() => {
    if (racing) input.current?.focus();
  }, [racing]);

  // taper n'importe où ramène l'écriture dans le texte (sans gêner Tab ni les boutons et liens)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const field = input.current;
      if (!field || document.activeElement === field || field.disabled || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      if (e.target instanceof Element && e.target.closest("a,button")) return;
      field.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <section className={PANEL} aria-label={t("game.typingArea")}>
      <div className="col-start-2 row-start-1 flex gap-[2.4vh] narrow:gap-4">
        <p className={STAT}><span className={STAT_LABEL}>{t("game.wpm")}</span><b className={STAT_VALUE}>{formatNumber(i18n.language, myWpm(race))}</b></p>
        <p className={STAT}><span className={STAT_LABEL}>{t("game.accuracy")}</span><b className={STAT_VALUE}>{formatNumber(i18n.language, myAccuracy(race))} %</b></p>
      </div>
      <p className="col-start-1 row-start-1 font-mono text-[max(18px,2.6vh)] leading-none font-normal text-red-text tabular-nums" role="timer" aria-label={`${t(unlimited ? "game.elapsed" : "game.time")} ${seconds} s`}>{timerPrefix}{seconds}</p>
      <TypingText words={race.course.words} wordIndex={race.wordIndex} typed={race.typed} missed={race.missedWords} active={racing} lang={lang} />
      <div className="absolute inset-0 z-2">
        <label htmlFor="game-input" className="sr-only">{t("game.typeHere")}</label>
        <input
          ref={input}
          id="game-input"
          className="unset box-border block size-full cursor-text text-[16px] text-transparent caret-transparent opacity-0"
          type="text"
          lang={lang}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          disabled={disabled}
          aria-invalid={wrong}
          value={race.typed}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => { if (LOCKED_KEYS.includes(e.key)) e.preventDefault(); }}
          onPaste={(e) => e.preventDefault()}
        />
      </div>
    </section>
  );
}
