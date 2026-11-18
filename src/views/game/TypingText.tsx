import { memo, useLayoutEffect, useRef } from "react";

const PastOrNextWord = memo(function PastOrNextWord({ text, status }: { text: string; status: "next" | "done" | "missed" }) {
  const classes = { next: "game-word", done: "game-word is-done", missed: "game-word is-done is-missed" }[status];
  return <span className={classes}>{text}</span>;
});

/** The word being typed, letter by letter: right in white, wrong in red, extra letters added in red. */
function CurrentWord({ text, typed }: { text: string; typed: string }) {
  return (
    <span className="game-word is-current">
      {[...typed].map((char, k) => {
        if (k >= text.length) return <span key={k} className="is-wrong is-extra">{char === " " ? "·" : char}</span>;
        return <span key={k} className={char === text[k] ? "is-right" : "is-wrong"}>{text[k]}</span>;
      })}
      <i className="game-cursor" aria-hidden="true" />
      {typed.length < text.length && <span>{text.slice(typed.length)}</span>}
    </span>
  );
}

type TypingTextProps = { words: string[]; wordIndex: number; typed: string; missed: ReadonlySet<number>; active: boolean; lang: string };

export function TypingText({ words, wordIndex, typed, missed, active, lang }: TypingTextProps) {
  const box = useRef<HTMLParagraphElement>(null);

  // le texte peut être long : la ligne du mot en cours reste visible
  useLayoutEffect(() => {
    const current = box.current?.querySelector<HTMLElement>(".is-current");
    if (current) box.current!.scrollTop = Math.max(0, current.offsetTop - current.offsetHeight);
  }, [wordIndex, typed, active]);

  return (
    <p ref={box} className="game-text" lang={lang}>
      {words.map((word, i) => {
        if (i === wordIndex && active) return <CurrentWord key={i} text={word} typed={typed} />;
        return <PastOrNextWord key={i} text={word} status={i >= wordIndex ? "next" : missed.has(i) ? "missed" : "done"} />;
      })}
    </p>
  );
}
