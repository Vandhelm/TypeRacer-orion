export type ViewTabOption<T extends string> = { value: T; label: string; num?: string };

type ViewTabsProps<T extends string> = {
  options: ViewTabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
};

const TAB =
  "unset box-border flex h-[5.2vh] min-h-[44px] flex-[1_1_0] items-center justify-center gap-[1.2vh] font-sans text-[max(11px,1.3vh)] leading-none font-medium tracking-[.26em] " +
  "transition-[background,color] duration-200 ease-[ease] focus-visible:outline focus-visible:outline-offset-4 focus-visible:outline-white";

/** Segmented switch between views (Tailwind; the profile page restyles .view-tabs / .view-tab in its own CSS). */
export function ViewTabs<T extends string>({ options, value, onChange, ariaLabel }: ViewTabsProps<T>) {
  return (
    <div className="view-tabs flex animate-[rise_.7s_.5s_cubic-bezier(.2,.8,.2,1)_both] border border-line motion-reduce:animate-none" role="group" aria-label={ariaLabel}>
      {options.map((option, i) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            className={`view-tab ${TAB} ${i > 0 ? "border-l border-l-line" : ""} ${active ? "cursor-default bg-[#f2f2f2] text-black" : "cursor-pointer text-muted hover:bg-[rgba(255,255,255,.06)] hover:text-white"}`}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
          >
            {option.num && <span className="font-mono tracking-[0] opacity-90">{option.num}</span>}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
