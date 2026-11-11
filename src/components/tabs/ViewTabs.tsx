export type ViewTabOption<T extends string> = { value: T; label: string; num?: string };

type ViewTabsProps<T extends string> = {
  options: ViewTabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
};

/** Segmented switch between views (styles: components/tabs/view-tabs.css). */
export function ViewTabs<T extends string>({ options, value, onChange, ariaLabel }: ViewTabsProps<T>) {
  return (
    <div className="view-tabs" role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            className={active ? "view-tab active" : "view-tab"}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
          >
            {option.num && <span className="n">{option.num}</span>}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
