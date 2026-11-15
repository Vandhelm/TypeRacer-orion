import { useTranslation } from "react-i18next";
import { languages, type Language } from "../../../i18n";

/** Interface language. i18next keeps the choice in localStorage. */
export function LanguageSection() {
  const { t, i18n } = useTranslation();
  const current = i18n.resolvedLanguage as Language | undefined;

  return (
    <section className="profile-section" aria-labelledby="language-title">
      <h2 id="language-title" className="profile-section-title">{t("account.language.title")}</h2>
      <div className="acc-box">
        <div className="acc-main">
          <fieldset className="language-choices">
            <legend className="sr-only">{t("account.language.title")}</legend>
            {(Object.keys(languages) as Language[]).map((code) => (
              <label key={code} className="text-choice">
                <input type="radio" name="language" value={code} checked={current === code} onChange={() => void i18n.changeLanguage(code)} />
                <span>{languages[code]}</span>
              </label>
            ))}
          </fieldset>
          <p className="acc-help">{t("account.language.help")}</p>
        </div>
      </div>
    </section>
  );
}
