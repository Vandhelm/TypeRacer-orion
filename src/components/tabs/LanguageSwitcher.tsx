import { useTranslation } from "react-i18next";
import { languages, setLanguage, type Language } from "../../i18n";
import { HANGING_TAB_GAP, HANGING_TAB_WIDTH, HangingTabs } from "./HangingTabs";
import { INLINE_BUTTON, ThemeToggle } from "./ThemeToggle";

// PERF-01 (Lighthouse, WCAG 2.5.3) : le nom accessible commence par le texte visible (« EN, English »).
const TABS = (["fr", "en"] as const).map((code) => ({ value: code, label: code.toUpperCase(), ariaLabel: `${code.toUpperCase()}, ${languages[code]}` }));

/**
 * DES-05: the width of the whole row (theme switch, then one tab per language), for the pages whose header must keep
 * clear of it (RoomPage). Derived from the tab count: adding a tab cannot make it cover a heading again.
 */
export const HANGING_ROW_WIDTH = (1 + TABS.length) * HANGING_TAB_WIDTH + TABS.length * HANGING_TAB_GAP;

/** Pinned to the top-right corner, for pages without a navbar. */
export const FLOATING_TABS = "fixed top-0 right-[clamp(16px,4vw,56px)] z-50 flex items-start gap-2";

type Props = {
  className?: string;
  onChanged?: () => void;
  /** "hanging": tabs hanging from the top edge (pages without the navbar). "inline": plain text in the navbar. */
  variant?: "hanging" | "inline";
};

/**
 * I18N-02: the FR / EN switcher every page shows (Tailwind).
 * DES-05: the theme switch comes just before it, so every page has both; `className` places the whole row.
 */
export function LanguageSwitcher({ className = "", onChanged, variant = "hanging" }: Props) {
  const { t, i18n } = useTranslation();
  const current = i18n.resolvedLanguage as Language | undefined;
  const choose = (lng: Language) => void setLanguage(i18n, lng).then(onChanged);
  if (variant === "inline") {
    return (
      <div className={`flex items-center gap-2 font-mono text-[11px] leading-none font-medium tracking-[.2em] ${className}`.trim()}>
        <ThemeToggle variant="inline" />
        <div role="group" aria-label={t("home.langChoice")} className="flex items-center">
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
      </div>
    );
  }
  return (
    <div className={className || undefined}>
      <ThemeToggle />
      <HangingTabs className="flex items-start gap-2" ariaLabel={t("home.langChoice")} options={TABS} value={current} onChange={choose} />
    </div>
  );
}
