import { useTranslation } from "react-i18next";
import { languages, setLanguage, type Language } from "../../i18n";
import { HangingTabs } from "./HangingTabs";

// PERF-01 (Lighthouse, WCAG 2.5.3) : le nom accessible commence par le texte visible (« EN, English »).
const TABS = (["fr", "en"] as const).map((code) => ({ value: code, label: code.toUpperCase(), ariaLabel: `${code.toUpperCase()}, ${languages[code]}` }));

/** Pinned to the top-right corner, for pages without a navbar. */
export const FLOATING_TABS = "fixed top-0 right-[clamp(16px,4vw,56px)] z-50 flex items-start gap-2";

const INLINE_BUTTON =
  "unset cursor-pointer px-1 py-1.5 text-muted transition-colors duration-200 hover:text-white aria-pressed:text-white motion-reduce:transition-none " +
  "focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-white";

type Props = {
  className?: string;
  onChanged?: () => void;
  /** "hanging": tabs hanging from the top edge (pages without the navbar). "inline": plain FR / EN text in the navbar. */
  variant?: "hanging" | "inline";
};

/** I18N-02: the FR / EN switcher every page shows (Tailwind). */
export function LanguageSwitcher({ className = "", onChanged, variant = "hanging" }: Props) {
  const { t, i18n } = useTranslation();
  const current = i18n.resolvedLanguage as Language | undefined;
  const choose = (lng: Language) => void setLanguage(i18n, lng).then(onChanged);
  if (variant === "inline") {
    return (
      <div role="group" aria-label={t("home.langChoice")} className={`flex items-center font-mono text-[11px] leading-none font-medium tracking-[.2em] ${className}`.trim()}>
        {TABS.map((tab, index) => (
          // tiny phones: only the other language stays, as a one-tap switch
          <span key={tab.value} className={`flex items-center ${tab.value === current ? "tiny:hidden" : ""}`.trim()}>
            {index > 0 && <span aria-hidden="true" className="px-0.5 text-muted tiny:hidden">/</span>}
            <button type="button" className={INLINE_BUTTON} aria-pressed={tab.value === current} aria-label={tab.ariaLabel} onClick={() => choose(tab.value)}>
              {tab.label}
            </button>
          </span>
        ))}
      </div>
    );
  }
  return (
    <HangingTabs
      className={className}
      ariaLabel={t("home.langChoice")}
      options={TABS}
      value={current}
      onChange={choose}
    />
  );
}
