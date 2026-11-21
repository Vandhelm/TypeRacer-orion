import { useTranslation } from "react-i18next";
import { languages, setLanguage, type Language } from "../../i18n";
import { HANGING_TAB_GAP, HANGING_TAB_WIDTH, HangingTabs } from "./HangingTabs";
import { ThemeToggle } from "./ThemeToggle";

// PERF-01 (Lighthouse, WCAG 2.5.3) : le nom accessible commence par le texte visible (« EN, English »).
const TABS = (["fr", "en"] as const).map((code) => ({ value: code, label: code.toUpperCase(), ariaLabel: `${code.toUpperCase()}, ${languages[code]}` }));

/**
 * DES-05: the width of the whole row (theme switch, then one tab per language), for the pages whose header must keep
 * clear of it (RoomPage). Derived from the tab count: adding a tab cannot make it cover a heading again.
 */
export const HANGING_ROW_WIDTH = (1 + TABS.length) * HANGING_TAB_WIDTH + TABS.length * HANGING_TAB_GAP;

/** Pinned to the top-right corner, for pages without a navbar. */
export const FLOATING_TABS = "fixed top-0 right-[clamp(16px,4vw,56px)] z-50 flex items-start gap-2";

/**
 * I18N-02: FR / EN switcher hanging from the top edge, shared by every page (Tailwind).
 * DES-05: the theme switch hangs just before it, so every page has both; `className` places the whole row.
 */
export function LanguageSwitcher({ className = "", onChanged }: { className?: string; onChanged?: () => void }) {
  const { t, i18n } = useTranslation();
  return (
    <div className={className || undefined}>
      <ThemeToggle />
      <HangingTabs
        className="flex items-start gap-2"
        ariaLabel={t("home.langChoice")}
        options={TABS}
        value={i18n.resolvedLanguage as Language | undefined}
        onChange={(lng) => void setLanguage(i18n, lng).then(onChanged)}
      />
    </div>
  );
}
