import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { myAccuracy, myWpm, secondsLeft, type Race } from "./race";
import { TypingText } from "./TypingText";

const LOCKED_KEYS = ["Enter", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];

/** Timer, stats and the text itself. The real input is invisible and covers the panel: the player writes "in" the text. */
export function TypingPanel({ race, onInput, lang }: { race: Race; onInput: (value: string) => void; lang: string }) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const racing = race.phase === "racing";
  const disabled = !racing || race.finishedAt > 0;
  const seconds = secondsLeft(race);
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
    <section className="game-panel" aria-label={t("game.typingArea")}>
      <div className="game-stats">
        <p className="game-stat"><span className="game-stat-label">{t("game.wpm")}</span><b>{myWpm(race)}</b></p>
        <p className="game-stat"><span className="game-stat-label">{t("game.accuracy")}</span><b>{myAccuracy(race)} %</b></p>
      </div>
      <p className="game-timer" role="timer" aria-label={`${t("game.time")} ${seconds} s`}>{timerPrefix}{seconds}</p>
      <TypingText words={race.course.words} wordIndex={race.wordIndex} typed={race.typed} missed={race.missedWords} active={racing} lang={lang} />
      <div className="game-input-layer">
        <label htmlFor="game-input" className="sr-only">{t("game.typeHere")}</label>
        <input
          ref={input}
          id="game-input"
          className="game-input"
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
