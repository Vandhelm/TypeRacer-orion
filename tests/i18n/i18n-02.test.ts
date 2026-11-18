import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { LANGUAGE_COOKIE, languageCookie, resolveLanguage } from "../../src/i18n/server";

describe("I18N-02 — langue choisie, conservée, sinon celle du navigateur", () => {
  test("le cookie prime sur Accept-Language", () => {
    expect(resolveLanguage("en", "fr-FR,fr;q=0.9")).toBe("en");
    expect(resolveLanguage("fr", "en-US,en;q=0.9")).toBe("fr");
  });

  test("sans cookie, la langue du navigateur est utilisée (fr-CA donne fr)", () => {
    expect(resolveLanguage(undefined, "fr-CA,fr;q=0.9,en;q=0.8")).toBe("fr");
    expect(resolveLanguage(undefined, "en-GB")).toBe("en");
  });

  test("Accept-Language est lu par ordre de préférence (q)", () => {
    expect(resolveLanguage(undefined, "de;q=0.9,en;q=0.5,fr;q=0.8")).toBe("fr");
    expect(resolveLanguage(undefined, "en;q=0.2,fr;q=0.8")).toBe("fr");
  });

  test("valeurs invalides : cookie inconnu ou en-tête illisible retombent sur le navigateur puis l'anglais", () => {
    expect(resolveLanguage("de", "fr")).toBe("fr");
    expect(resolveLanguage("<script>", null)).toBe("en");
    expect(resolveLanguage(undefined, "de,es")).toBe("en");
    expect(resolveLanguage(undefined, ";;;,q=x")).toBe("en");
    expect(resolveLanguage(null, undefined)).toBe("en");
  });

  test("le nom du cookie est stable", () => {
    expect(LANGUAGE_COOKIE).toBe("orion-lang");
  });

  test("chaque page affiche le sélecteur de langue", () => {
    for (const page of ["home/HomePage", "room/RoomPage", "game/GamePage", "podium/PodiumPage", "profile/ProfilePage"]) {
      expect(readFileSync(`src/views/${page}.tsx`, "utf8")).toContain("<LanguageSwitcher");
    }
  });

  test("le sélecteur de /profile est rendu pour toutes ses variantes (attente, profil propre, joueur)", () => {
    const source = readFileSync("src/views/profile/ProfilePage.tsx", "utf8");
    const wrapper = source.slice(source.indexOf("export function ProfilePage"), source.indexOf("function PlayerProfile"));
    expect(wrapper).toContain("<LanguageSwitcher");
    expect(wrapper).toContain("<OwnProfile");
    expect(wrapper.indexOf("<LanguageSwitcher")).toBeLessThan(wrapper.indexOf("<OwnProfile"));
  });

  test("la page 404 a le sélecteur, un titre traduit et aucune couleur en dur", () => {
    const source = readFileSync("app/not-found.tsx", "utf8");
    expect(source).toContain("NotFoundLanguage");
    expect(source).toContain("generateMetadata");
    expect(source).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });

  test("l'en-tête du profil laisse la place au sélecteur flottant", () => {
    const css = readFileSync("src/styles/pages/profile/profile.css", "utf8");
    const head = /\.profile-head\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(head).toMatch(/padding-top:\s*(8\d|9\d|1\d\d)px/);
  });

  test("chaque page lit sa langue et son titre côté serveur depuis le cookie", () => {
    for (const page of ["page", "room/page", "game/page", "podium/page", "profile/page"]) {
      expect(readFileSync(`app/${page}.tsx`, "utf8")).toContain("titleFor(");
    }
    expect(readFileSync("app/layout.tsx", "utf8")).toContain("requestLanguage()");
    expect(readFileSync("app/layout.tsx", "utf8")).not.toContain('lang="fr"');
  });

  test("le cookie du choix vaut sur tout le site et dure un an", () => {
    const cookie = languageCookie("fr");
    expect(cookie).toStartWith("orion-lang=fr;");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=31536000");
    expect(cookie).toContain("SameSite=Lax");
  });
});
