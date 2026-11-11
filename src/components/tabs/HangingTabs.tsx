export type HangingTabOption<T extends string> = { value: T; label: string; ariaLabel?: string };

type HangingTabsProps<T extends string> = {
  options: HangingTabOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
};

/** Tabs hanging from the top edge (styles: components/tabs/hanging-tabs.css). */
export function HangingTabs<T extends string>({ options, value, onChange, ariaLabel, className = "" }: HangingTabsProps<T>) {
  return (
    <div className={`hanging-tabs ${className}`.trim()} role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            className={active ? "hanging-tab active" : "hanging-tab"}
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
