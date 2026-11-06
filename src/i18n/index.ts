import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import fr from "./locales/fr.json";

export const languages = { en: "English", fr: "Français" } as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, fr: { translation: fr } },
    supportedLngs: Object.keys(languages),
    fallbackLng: "en",
    nonExplicitSupportedLngs: true, // "fr-CA" -> "fr"
    detection: {
      order: ["localStorage", "navigator"], // user choice first, then system language
      caches: ["localStorage"],
    },
    interpolation: { escapeValue: false },
  });

i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
});

export default i18n;
