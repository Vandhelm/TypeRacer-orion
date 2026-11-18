// Pour les tests : les vraies traductions, sans détection de langue ni DOM.
import i18next, { type TFunction } from "i18next";
import en from "./locales/en.json";
import fr from "./locales/fr.json";

export const instance = i18next.createInstance();
await instance.init({ resources: { en: { translation: en }, fr: { translation: fr } }, lng: "fr", fallbackLng: "en", interpolation: { escapeValue: false } });

export const translate = (language: "fr" | "en"): TFunction => instance.getFixedT(language);
