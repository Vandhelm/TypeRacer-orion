import { useRef, type KeyboardEvent } from "react";

export type SectionTabOption<T extends string> = { value: T; label: string; num?: string; id: string; panelId: string };

type SectionTabsProps<T extends string> = {
  options: SectionTabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
};

/** Accessible tablist, arrow keys move between tabs (styles: components/tabs/section-tabs.css). */
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
    <div className="section-tabs" role="tablist" aria-label={ariaLabel}>
      {options.map((option, i) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => { tabs.current[i] = node; }}
            className="section-tab"
            type="button"
            role="tab"
            id={option.id}
            aria-controls={option.panelId}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {option.num && <span className="n">{option.num}</span>}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
