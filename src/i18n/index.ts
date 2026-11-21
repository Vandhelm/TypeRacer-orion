// Shared translation system for every page.
// I18N-02: the user's choice lives in a cookie, read by the server (src/i18n/request.ts), which hands the
// resolved language to <I18nProvider> in app/layout.tsx. Without the cookie, Accept-Language is used.
// TECH-01: nothing here touches document or window at import, so pages can render on the server.
import i18next, { type i18n as I18n } from "i18next";
import en from "./locales/en.json";
import fr from "./locales/fr.json";
import { languageCookie, type SupportedLanguage } from "./server";

export const languages = { en: "English", fr: "Français" } as const;
export type Language = SupportedLanguage;

/** One instance per request on the server (and one per tab in the browser), started in the given language. */
export function createI18n(language: Language): I18n {
  const instance = i18next.createInstance();
  instance.init({
    resources: { en: { translation: en }, fr: { translation: fr } },
    supportedLngs: Object.keys(languages),
    lng: language,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    initAsync: false, // resources are bundled: translations are ready right after init
  });
  return instance;
}

/** Browser only: switches the language and remembers it in the cookie the server also reads. */
export async function setLanguage(i18n: I18n, language: Language) {
  document.cookie = languageCookie(language);
  await i18n.changeLanguage(language);
}
