// Shared translation system for every page (React or plain HTML).
// I18N-02: the user's choice lives in a cookie (read by the server for <html lang> and <title>);
// without it, the browser language is used.
// React pages wrap their tree in <I18nextProvider i18n={i18n}>.
import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en.json";
import fr from "./locales/fr.json";
import { LANGUAGE_COOKIE, languageCookie } from "./server";

export const languages = { en: "English", fr: "Français" } as const;
export type Language = keyof typeof languages;

i18n.use(LanguageDetector).init({
  resources: { en: { translation: en }, fr: { translation: fr } },
  supportedLngs: Object.keys(languages),
  fallbackLng: "en",
  nonExplicitSupportedLngs: true, // "fr-CA" -> "fr"
  detection: {
    order: ["cookie", "navigator"], // user choice first, then system language
    lookupCookie: LANGUAGE_COOKIE,
    caches: [], // the cookie is written by setLanguage, with a one-year lifetime
  },
  interpolation: { escapeValue: false },
  initAsync: false, // resources are bundled: translations are ready right after import
});

/** Switches the language and remembers it in the cookie the server also reads. */
export async function setLanguage(language: Language) {
  document.cookie = languageCookie(language);
  await i18n.changeLanguage(language);
}

const syncHtmlLang = (lng: string) => {
  document.documentElement.lang = lng;
};
syncHtmlLang(i18n.resolvedLanguage ?? "en");
i18n.on("languageChanged", syncHtmlLang);

export default i18n;
