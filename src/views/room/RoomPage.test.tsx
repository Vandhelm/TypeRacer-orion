import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../i18n";
import { PlayerProvider } from "../../players/PlayerProvider";
import { GamePage } from "../game/GamePage";
import { RoomPage } from "./RoomPage";

const render = (page: typeof RoomPage) =>
  renderToString(
    createElement(I18nextProvider, { i18n: createI18n("fr") }, createElement(PlayerProvider, { name: "Corail_418", guest: false, children: createElement(page) })),
  );

describe("TECH-01 — /room et /game rendus côté serveur", () => {
  test("se rendent sans window, document ni stockage du navigateur", () => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe("undefined");
    expect(() => render(RoomPage)).not.toThrow();
    expect(() => render(GamePage)).not.toThrow();
  });

  test("le salon : le bassin et les onglets de langue sont dans le HTML, le salon (gardé dans le navigateur) arrive au montage", () => {
    const html = render(RoomPage);
    expect(html).toContain("<canvas");
    expect(html).toContain("FR");
    expect(html).not.toContain("room-form");
  });

  test("la course : le cadre de la page est dans le HTML, sans texte tiré au hasard côté serveur", () => {
    const html = render(GamePage);
    expect(html).toContain("game-root");
    expect(html).toContain('href="/room"');
    expect(html).toContain("race-pool");
  });

  test("les routes /room et /game n'utilisent plus LegacyPage", () => {
    for (const route of ["app/room/page.tsx", "app/game/page.tsx"]) {
      const source = readFileSync(route, "utf8");
      expect(source).not.toContain("LegacyPage");
      expect(source).toContain("PlayerProvider");
    }
  });
});
