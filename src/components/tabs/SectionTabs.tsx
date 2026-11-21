import { useRef, type KeyboardEvent } from "react";

export type SectionTabOption<T extends string> = { value: T; label: string; num?: string; id: string; panelId: string };

type SectionTabsProps<T extends string> = {
  options: SectionTabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
};

const TAB =
  "unset box-border flex min-h-[42px] items-center gap-2.5 px-[clamp(12px,1.6vw,22px)] font-sans text-[max(11px,1.3vh)] leading-none font-medium tracking-[.24em] " +
  "transition-[background,color] duration-200 ease-[ease] focus-visible:outline focus-visible:outline-offset-3 focus-visible:outline-white " +
  "phone:flex-1 phone:px-1.5 narrow:min-h-[44px] narrow:justify-center narrow:tracking-[.14em]";

/** Accessible tablist, arrow keys move between tabs (Tailwind). Two columns of tabs on narrow screens. */
export function SectionTabs<T extends string>({ options, value, onChange, ariaLabel }: SectionTabsProps<T>) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent, index: number) {
    const direction = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!direction) return;
    e.preventDefault();
    const next = (index + direction + options.length) % options.length;
    onChange(options[next]!.value);
    tabs.current[next]?.focus();
  }

  return (
    <div className="flex border border-line bg-black phone:w-full narrow:grid narrow:grid-cols-[repeat(2,minmax(0,1fr))]" role="tablist" aria-label={ariaLabel}>
      {options.map((option, i) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => { tabs.current[i] = node; }}
            className={`${TAB} ${i > 0 ? `border-l border-l-line ${i % 2 === 0 ? "narrow:[border-left:0]" : ""}` : ""} ${i >= 2 ? "narrow:border-t narrow:border-t-line" : ""} ${selected ? "cursor-default bg-[#f2f2f2] text-black" : "cursor-pointer text-muted hover:bg-[rgba(255,255,255,.06)] hover:text-white"}`}
            type="button"
            role="tab"
            id={option.id}
            aria-controls={option.panelId}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {option.num && <span className="font-mono tracking-[0] opacity-90">{option.num}</span>}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
