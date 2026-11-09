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

/** Number input with up/down arrows, committed on blur (styles: components/forms/number-field.css). */
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
    <span className="number-field">
      <input
        ref={(node) => {
          input.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        className="number-field-input"
        type="number"
        min={min}
        max={max}
        aria-label={ariaLabel}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== String(value) && commit(draft)}
        onKeyDown={onKeyDown}
      />
      <span className="number-field-arrows">
        <button className="number-field-arrow" type="button" tabIndex={-1} aria-hidden="true" onClick={() => nudge(1)}>
          <ChevronIcon direction="up" />
        </button>
        <button className="number-field-arrow" type="button" tabIndex={-1} aria-hidden="true" onClick={() => nudge(-1)}>
          <ChevronIcon direction="down" />
        </button>
      </span>
    </span>
  );
}
