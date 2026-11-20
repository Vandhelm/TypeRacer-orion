import { useTranslation } from "react-i18next";
import { languages, setLanguage, type Language } from "../../i18n";
import { HangingTabs } from "./HangingTabs";

// PERF-01 (Lighthouse, WCAG 2.5.3) : le nom accessible commence par le texte visible (« EN, English »).
const TABS = (["fr", "en"] as const).map((code) => ({ value: code, label: code.toUpperCase(), ariaLabel: `${code.toUpperCase()}, ${languages[code]}` }));

/** Pinned to the top-right corner, for pages without a navbar. */
export const FLOATING_TABS = "fixed top-0 right-[clamp(16px,4vw,56px)] z-50 flex items-start gap-2";

/** I18N-02: FR / EN switcher hanging from the top edge, shared by every page (Tailwind). */
export function LanguageSwitcher({ className = "", onChanged }: { className?: string; onChanged?: () => void }) {
  const { t, i18n } = useTranslation();
  return (
    <HangingTabs
      className={className}
      ariaLabel={t("home.langChoice")}
      options={TABS}
      value={i18n.resolvedLanguage as Language | undefined}
      onChange={(lng) => void setLanguage(i18n, lng).then(onChanged)}
    />
  );
}
