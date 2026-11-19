import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../i18n";
import { ProfilePage } from "./ProfilePage";
import type { PlayerStats } from "./stats";

const STATS: PlayerStats = {
  name: "Nori_Ssr", bot: true, image: null, races: 3, wins: 2, bestWpm: 88, averageWpm: 70, averageAccuracy: 96.5,
  progress: [{ at: "2026-11-01T10:00:00.000Z", wpm: 70, accuracy: 96 }], keys: {},
};
const none = { player: null, name: null, race: null };

const render = (props: Parameters<typeof ProfilePage>[0]) =>
  renderToString(createElement(I18nextProvider, { i18n: createI18n("fr") }, createElement(ProfilePage, props)));

describe("TECH-01 — /profile rendu côté serveur", () => {
  test("se rend sans window, document ni stockage du navigateur", () => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe("undefined");
    expect(() => render({ me: null, query: none })).not.toThrow();
  });

  test("?name=X : le nom et les stats préchargées sont dans le HTML du serveur", () => {
    const html = render({ me: null, query: { ...none, name: "Nori_Ssr" }, stats: STATS });
    expect(html).toContain("Nori_Ssr");
    expect(html).toContain("88");
    expect(html).not.toContain('aria-busy="true"');
  });

  test("connecté, sans paramètre : son profil (onglets Compte et Stats), sans attendre la session", () => {
    const html = render({ me: { name: "Compte_Ssr", displayUsername: "Compte_Ssr" }, query: none, stats: { ...STATS, name: "Compte_Ssr" } });
    expect(html).toContain('class="view-tabs"');
    expect(html).not.toContain('aria-busy="true"');
  });

  test("la route n'utilise plus LegacyPage et lit la session côté serveur", () => {
    const route = readFileSync("app/profile/page.tsx", "utf8");
    expect(route).not.toContain("LegacyPage");
    expect(route).toContain("profileData");
  });
});
