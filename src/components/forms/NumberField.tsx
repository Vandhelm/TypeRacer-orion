import { useEffect, useRef, useState, type KeyboardEvent, type Ref } from "react";
import { ChevronIcon } from "../icons";

type NumberFieldProps = {
  value: number;
  min: number;
  max: number;
  step?: number;
  ariaLabel: string;
  /** Called with a clamped integer when the edit is committed (blur, Enter or arrows). */
  onCommit: (value: number) => void;
  ref?: Ref<HTMLInputElement>;
};

const ARROW =
  "unset box-border flex h-4 w-[22px] cursor-pointer items-center justify-center text-muted transition-[color] duration-200 ease-[ease] hover:text-white focus-visible:outline focus-visible:outline-white [&_svg]:size-[9px]";

/** Number input with up/down arrows, committed on blur (Tailwind). */
export function NumberField({ value, min, max, step = 1, ariaLabel, onCommit, ref }: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value));
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => setDraft(String(value)), [value]);

  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  function commit(raw: string) {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n)) return;
    setDraft(String(clamp(n)));
    onCommit(clamp(n));
  }
  function nudge(direction: 1 | -1) {
    commit(String(clamp(Math.round(Number(draft) || min) + direction * step)));
    input.current?.focus();
  }
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") commit(draft);
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        ref={(node) => {
          input.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        className="unset box-border h-8 w-[3.4em] border-b border-b-line-soft text-center font-sans text-[clamp(17px,2.6vh,24px)] leading-none font-light text-white caret-red-text focus:border-b-white [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
        type="number"
        min={min}
        max={max}
        aria-label={ariaLabel}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== String(value) && commit(draft)}
        onKeyDown={onKeyDown}
      />
      <span className="flex flex-col">
        <button className={ARROW} type="button" tabIndex={-1} aria-hidden="true" onClick={() => nudge(1)}>
          <ChevronIcon direction="up" />
        </button>
        <button className={ARROW} type="button" tabIndex={-1} aria-hidden="true" onClick={() => nudge(-1)}>
          <ChevronIcon direction="down" />
        </button>
      </span>
    </span>
  );
}
