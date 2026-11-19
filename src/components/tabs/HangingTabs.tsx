export type HangingTabOption<T extends string> = { value: T; label: string; ariaLabel?: string };

type HangingTabsProps<T extends string> = {
  options: HangingTabOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
};

const TAB =
  "unset box-border flex w-12 animate-[drop_.6s_.7s_cubic-bezier(.2,.9,.3,1.25)_both] flex-col items-center justify-end border-x border-b bg-black pb-2.5 pl-[.15em] " +
  "font-mono text-[12px] leading-none font-medium tracking-[.15em] transition-[height,color,border-color] duration-[.25s,.2s,.2s] ease-[ease] " +
  "[&+&]:[animation-delay:.82s] focus-visible:outline focus-visible:outline-offset-4 focus-visible:outline-white motion-reduce:animate-none";

/** Tabs hanging from the top edge (Tailwind; keyframe drop in base/animations.css). */
export function HangingTabs<T extends string>({ options, value, onChange, ariaLabel, className = "" }: HangingTabsProps<T>) {
  return (
    <div className={className || undefined} role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            className={`hanging-tab ${TAB} ${active ? "h-[84px] cursor-default border-line text-white [box-shadow:inset_0_-3px_0_var(--color-red-solid)]" : "h-16 cursor-pointer border-line-soft text-line-soft hover:h-[72px] hover:border-line hover:text-white"}`}
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
