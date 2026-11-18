// I18N-01 / I18N-02 : choix de la langue et titres de page côté serveur (aucun accès à document : sûr dans
// les composants serveur, les métadonnées Next.js et les tests).
import en from "./locales/en.json";
import fr from "./locales/fr.json";

export const LANGUAGE_COOKIE = "orion-lang";
export const DEFAULT_LANGUAGE = "en";

/** Valeur à écrire dans document.cookie pour mémoriser le choix un an, sur tout le site. */
export const languageCookie = (language: string) => `${LANGUAGE_COOKIE}=${language}; Path=/; Max-Age=31536000; SameSite=Lax`;
export const SUPPORTED_LANGUAGES = ["fr", "en"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const isSupported = (value: string | null | undefined): value is SupportedLanguage =>
  SUPPORTED_LANGUAGES.includes(value as SupportedLanguage);

/** « fr-CA;q=0.8 » -> « fr », dans l'ordre de préférence ; les étiquettes non gérées sont ignorées. */
function fromAcceptLanguage(header: string | null | undefined): SupportedLanguage | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => /^\s*q=([\d.]+)\s*$/.exec(p)?.[1]).find(Boolean);
      return { code: tag.trim().toLowerCase().split("-")[0], q: q === undefined ? 1 : Number(q), index };
    })
    .filter((entry) => isSupported(entry.code) && entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  return (ranked[0]?.code as SupportedLanguage | undefined) ?? null;
}

/** Le choix mémorisé (cookie) d'abord, puis la langue du navigateur, puis l'anglais. */
export function resolveLanguage(cookie: string | null | undefined, acceptLanguage: string | null | undefined): SupportedLanguage {
  if (isSupported(cookie)) return cookie;
  return fromAcceptLanguage(acceptLanguage) ?? DEFAULT_LANGUAGE;
}

export type TitledPage = "home" | "room" | "game" | "podium" | "profile";

const TITLES: Record<SupportedLanguage, Record<TitledPage, string>> = {
  fr: { home: fr.home.pageTitle, room: fr.room.pageTitle, game: fr.game.pageTitle, podium: fr.podium.pageTitle, profile: fr.profile.defaultTitle },
  en: { home: en.home.pageTitle, room: en.room.pageTitle, game: en.game.pageTitle, podium: en.podium.pageTitle, profile: en.profile.defaultTitle },
};

export const notFoundText = (language: SupportedLanguage) => (language === "fr" ? fr : en).notFound;

export const pageTitle = (language: SupportedLanguage, page: TitledPage) => TITLES[language][page];
