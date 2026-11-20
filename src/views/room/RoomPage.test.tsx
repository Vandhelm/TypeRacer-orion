import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../i18n";
import { PlayerProvider } from "../../players/PlayerProvider";
import { DEFAULT_SETTINGS } from "../../rooms/settings";
import { GamePage } from "../game/GamePage";
import type { RoomState } from "./hooks/useRoom";
import type { Seat } from "./room";
import { RoomPage } from "./RoomPage";
import { RoomTicket } from "./RoomTicket";

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

  test("la course : le HTML montre l'attente du salon, sans texte tiré au hasard côté serveur", () => {
    // SALLE-09 : la course part du salon lu sur le serveur de jeu ; le HTML ne montre que l'attente
    const html = render(GamePage);
    expect(html).toContain('role="status"');
    expect(html).toContain("Ouverture du salon");
    expect(html).not.toContain("<canvas");
  });

  test("les routes /room et /game n'utilisent plus LegacyPage", () => {
    for (const route of ["app/room/page.tsx", "app/game/page.tsx"]) {
      const source = readFileSync(route, "utf8");
      expect(source).not.toContain("LegacyPage");
      expect(source).toContain("PlayerProvider");
    }
  });
});

const SEATS: Seat[] = [
  { name: "Corail_418", color: "#e05a4a", host: true, me: true },
  { name: "Maki_Test", color: "#4a7ae0" },
  { name: "Thon_Rouge", color: "#4ae07a", bot: true },
];
const ticket = (language: "fr" | "en") => {
  const state = { room: { ...DEFAULT_SETTINGS, bots: true }, seats: SEATS, players: SEATS, humans: 2, displayName: "Salon test" } as unknown as RoomState;
  const html = renderToString(createElement(I18nextProvider, { i18n: createI18n(language) }, createElement(RoomTicket, { state })));
  return html.match(/<li[\s\S]*?<\/li>/g) ?? [];
};

describe("BOT-04 — the waiting room marks a bot as such, and only bots", () => {
  test("on the ticket, the bot seat carries the BOT marker; the human seats do not", () => {
    const [host, guest, bot] = ticket("fr");
    expect(bot).toContain('data-part="bot"');
    expect(bot).toContain("BOT");
    expect(host).not.toContain('data-part="bot"');
    expect(guest).not.toContain('data-part="bot"');
  });

  test("the marker reads the same in English", () => {
    expect(ticket("en")[2]).toMatch(/data-part="bot"[\s\S]*BOT[\s\S]*computer player/);
  });
});
