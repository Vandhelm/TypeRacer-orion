import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../i18n";
import { HomePage } from "./HomePage";

const render = (props: Parameters<typeof HomePage>[0]) =>
  renderToString(createElement(I18nextProvider, { i18n: createI18n("fr") }, createElement(HomePage, props)));

describe("AUTH-01 — le panneau de connexion offre GitHub, Discord et les identifiants", () => {
  const html = render({ me: null });
  const button = (id: string) => html.match(new RegExp(`<button[^>]*id="${id}"[^>]*>`))?.[0];

  test("offers a GitHub button and a Discord button", () => {
    expect(button("login-github")).toContain('data-provider="github"');
    expect(button("login-discord")).toContain('data-provider="discord"');
    expect(button("login-github")).not.toContain("disabled");
    expect(button("login-discord")).not.toContain("disabled");
  });

  test("offers the username and password form next to them", () => {
    const input = (id: string) => html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0];
    expect(input("username")).toContain('name="username"');
    expect(input("password")).toContain('type="password"');
  });
});

describe("TECH-01 — /home rendu côté serveur", () => {
  test("se rend sans window, document ni stockage du navigateur", () => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe("undefined");
    expect(() => render({ me: null })).not.toThrow();
  });

  test("la coquille est dans le HTML : navbar, panneau, tickets des salons et canvas de la scène", () => {
    const html = render({ me: null });
    expect(html).toContain("O.R.I.O.N");
    expect(html).toContain('id="decor"');
    expect(html).toContain('href="/profile"');
    expect(html).toContain("ticket");
  });

  test("connecté : le serveur rend son compte, sans passer d'abord par le formulaire de connexion", () => {
    const html = render({ me: { id: "u1", name: "compte_ssr", displayUsername: "Compte_Ssr", username: "compte_ssr" } });
    expect(html).toContain("Compte_Ssr");
  });

  test("les routes / et /home n'utilisent plus LegacyPage et lisent la session côté serveur", () => {
    const route = readFileSync("app/page.tsx", "utf8");
    expect(route).not.toContain("LegacyPage");
    expect(route).toContain("currentUser");
  });
});
