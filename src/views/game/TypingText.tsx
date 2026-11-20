import { memo, useLayoutEffect, useRef } from "react";

// The cursor (.game-cursor) blinks with a keyframe: it stays in styles/pages/game/typing.css.
const WORD = "game-word mr-[1ch] inline-block whitespace-pre";

// BONUS-02 : le brouillard rend flous les mots après celui en cours
const FOG = `${WORD} blur-[.22em] transition-[filter] duration-300 motion-reduce:transition-none`;

const PastOrNextWord = memo(function PastOrNextWord({ text, status }: { text: string; status: "next" | "fog" | "done" | "missed" }) {
  const classes = { next: WORD, fog: FOG, done: `${WORD} text-white`, missed: `${WORD} text-red-text underline decoration-1 underline-offset-[.25em]` }[status];
  return <span className={classes}>{text}</span>;
});

/** The word being typed, letter by letter: right in white, wrong in red, extra letters added in red. */
function CurrentWord({ text, typed }: { text: string; typed: string }) {
  return (
    <span className={`${WORD} is-current`}>
      {[...typed].map((char, k) => {
        if (k >= text.length) return <span key={k} className="text-red-text underline decoration-1 underline-offset-[.2em]">{char === " " ? "·" : char}</span>;
        return <span key={k} className={char === text[k] ? "text-white" : "text-red-text"}>{text[k]}</span>;
      })}
      <i className="game-cursor" aria-hidden="true" />
      {typed.length < text.length && <span>{text.slice(typed.length)}</span>}
    </span>
  );
}

type TypingTextProps = { words: string[]; wordIndex: number; typed: string; missed: ReadonlySet<number>; active: boolean; lang: string; /** BONUS-02 */ fog?: boolean };

export function TypingText({ words, wordIndex, typed, missed, active, lang, fog = false }: TypingTextProps) {
  const box = useRef<HTMLParagraphElement>(null);

  // le texte peut être long : la ligne du mot en cours reste visible
  useLayoutEffect(() => {
    const current = box.current?.querySelector<HTMLElement>(".is-current");
    if (current) box.current!.scrollTop = Math.max(0, current.offsetTop - current.offsetHeight);
  }, [wordIndex, typed, active]);

  return (
    <p
      ref={box}
      className="relative col-[1/-1] row-start-2 max-h-[calc(3*1.7em)] overflow-hidden font-mono text-[max(17px,2.5vh)] leading-[1.7] font-normal wrap-anywhere text-muted transition-[opacity] duration-200 ease-[ease] group-not-focus-within:opacity-85 motion-reduce:transition-none"
      lang={lang}
    >
      {words.map((word, i) => {
        if (i === wordIndex && active) return <CurrentWord key={i} text={word} typed={typed} />;
        return <PastOrNextWord key={i} text={word} status={i > wordIndex && fog ? "fog" : i >= wordIndex ? "next" : missed.has(i) ? "missed" : "done"} />;
      })}
    </p>
  );
}
