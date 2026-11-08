// Shared translation system for every page (React or plain HTML).
// Detects the system language, remembers the user's choice in localStorage.
// React pages wrap their tree in <I18nextProvider i18n={i18n}>.
import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en.json";
import fr from "./locales/fr.json";

export const languages = { en: "English", fr: "Français" } as const;
export type Language = keyof typeof languages;

i18n.use(LanguageDetector).init({
  resources: { en: { translation: en }, fr: { translation: fr } },
  supportedLngs: Object.keys(languages),
  fallbackLng: "en",
  nonExplicitSupportedLngs: true, // "fr-CA" -> "fr"
  detection: {
    order: ["localStorage", "navigator"], // user choice first, then system language
    caches: ["localStorage"],
  },
  interpolation: { escapeValue: false },
  initAsync: false, // resources are bundled: translations are ready right after import
});

const syncHtmlLang = (lng: string) => {
  document.documentElement.lang = lng;
};
syncHtmlLang(i18n.resolvedLanguage ?? "en");
i18n.on("languageChanged", syncHtmlLang);

export default i18n;
