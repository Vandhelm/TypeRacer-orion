import { useTranslation } from "react-i18next";
import { languages, setLanguage, type Language } from "../../i18n";
import { HangingTabs } from "./HangingTabs";

const TABS = (["fr", "en"] as const).map((code) => ({ value: code, label: code.toUpperCase(), ariaLabel: languages[code] }));

/** I18N-02: FR / EN switcher hanging from the top edge, shared by every page (styles: components/tabs/hanging-tabs.css). */
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
