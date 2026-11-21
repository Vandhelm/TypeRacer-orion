export type HangingTabOption<T extends string> = { value: T; label: string; ariaLabel?: string };

type HangingTabsProps<T extends string> = {
  options: HangingTabOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
};

/** One tab's width (w-12) and the gap between two (gap-2), in px: keep in step with TAB and the rows' gap-2. */
export const HANGING_TAB_WIDTH = 48;
export const HANGING_TAB_GAP = 8;

const TAB =
  "unset box-border flex w-12 animate-[drop_.6s_.7s_cubic-bezier(.2,.9,.3,1.25)_both] flex-col items-center justify-end border-x border-b bg-black pb-2.5 pl-[.15em] " +
  "font-mono text-[12px] leading-none font-medium tracking-[.15em] transition-[height,color,border-color] duration-[.25s,.2s,.2s] ease-[ease] " +
  "[&+&]:[animation-delay:.82s] focus-visible:outline focus-visible:outline-offset-4 focus-visible:outline-white motion-reduce:animate-none";

const ON = "h-[84px] border-line text-white [box-shadow:inset_0_-3px_0_var(--color-red-solid)]";
const OFF = "h-16 border-line-soft text-muted hover:h-[72px] hover:border-line hover:text-white";

/** The classes of one hanging tab; `toggle` (DES-05 theme switch): a pressed tab stays clickable, to release it. */
export const hangingTab = (active: boolean, { toggle = false } = {}) =>
  `hanging-tab ${TAB} ${active ? ON : OFF} ${active && !toggle ? "cursor-default" : "cursor-pointer"}`;

/** Tabs hanging from the top edge (Tailwind; keyframe drop in base/animations.css). */
export function HangingTabs<T extends string>({ options, value, onChange, ariaLabel, className = "" }: HangingTabsProps<T>) {
  return (
    <div className={className || undefined} role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            className={hangingTab(active)}
            type="button"
            aria-label={option.ariaLabel}
            aria-pressed={active}
            onClick={() => !active && onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
