import { useTranslation } from "react-i18next";
import { languages } from "../i18n";

const codes = Object.keys(languages);

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();

  const next = () => {
    const i = codes.indexOf(i18n.resolvedLanguage ?? "en");
    i18n.changeLanguage(codes[(i + 1) % codes.length]);
  };

  return (
    <button
      type="button"
      onClick={next}
      className="rounded border px-3 py-1 text-sm hover:bg-gray-100"
    >
      {t("switchLanguage")}
    </button>
  );
}
