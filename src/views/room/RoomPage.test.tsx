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
import { RoomSettings } from "./RoomSettings";
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

describe("DES-05 — on the ticket, a seat is told apart by its number, not only its colour", () => {
  test("each player row shows its seat number beside the colour chip", () => {
    const rows = ticket("fr");
    rows.forEach((row, i) => expect(row).toMatch(new RegExp(`data-part="seat-number"[^>]*>${i + 1}<`)));
  });
});

describe("COURSE-03 — before the launch, a member is told the custom text comes at the launch", () => {
  const settings = (host: boolean, text: string, language: "fr" | "en" = "fr") => {
    const state = { room: { ...DEFAULT_SETTINGS, textType: "custom", text }, host, seats: [], update: () => {} } as unknown as RoomState;
    const html = renderToString(createElement(I18nextProvider, { i18n: createI18n(language) }, createElement(RoomSettings, { state, onEditText: () => {}, action: null })));
    return html.match(/id="label-text"[\s\S]*?<\/div>/)?.[0] ?? html;
  };

  test("a member (text withheld by the server) reads « revealed at launch », not « none »", () => {
    expect(settings(false, "")).toContain("Révélé au lancement");
    expect(settings(false, "", "en")).toContain("Revealed at launch");
    expect(settings(false, "")).not.toContain("Aucun");
  });

  test("the host still sees the word count of their text", () => {
    expect(settings(true, "le riz attend")).not.toContain("Révélé au lancement");
  });
});

describe("CONF-10 — the bots tab lists each bot with its level", () => {
  const botList = [{ name: "Ebi_Fry", level: "expert" }, { name: "Uni_Kun", level: "beginner" }];
  const seats: Seat[] = [{ name: "Corail_418", color: "red", host: true }, { name: "Ebi_Fry", color: "blue", bot: true, level: "expert" }];
  const panel = (host: boolean) => {
    const state = { room: { ...DEFAULT_SETTINGS, guests: 2, bots: true, botList }, host, seats, update: () => {} } as unknown as RoomState;
    const html = renderToString(createElement(I18nextProvider, { i18n: createI18n("fr") }, createElement(RoomSettings, { state, onEditText: () => {}, action: null })));
    return html.match(/id="panel-bots"[\s\S]*?id="panel-content"/)?.[0] ?? html;
  };

  test("the host sees every bot, its level, a remove button each, and no add button once the room is full", () => {
    const html = panel(true);
    expect(html).toContain("Ebi_Fry");
    expect(html).toContain("Uni_Kun");
    expect(html.match(/Retirer Ebi_Fry|Retirer Uni_Kun/g)).toHaveLength(2);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Un bot de plus/);
  });

  test("a bot without a seat is marked as waiting for one", () => {
    expect(panel(true)).toContain("En attente d&#x27;une place");
  });

  test("a member sees only each bot's level, without buttons", () => {
    const html = panel(false);
    expect(html).toContain("Ebi_Fry");
    expect(html).not.toContain("Retirer");
    expect(html).not.toContain("Un bot de plus");
  });

  test("BOT-01 — the host picks each bot's level among the five, the current one checked", () => {
    const html = panel(true);
    const radios = html.match(/<input[^>]*name="bot-level-Ebi_Fry"[^>]*>/g) ?? [];
    expect(radios.map((radio) => radio.match(/value="([^"]+)"/)?.[1])).toEqual(["noob", "beginner", "intermediate", "expert", "impossible"]);
    expect(radios.filter((radio) => /checked=""/.test(radio)).map((radio) => radio.match(/value="([^"]+)"/)?.[1])).toEqual(["expert"]);
    for (const label of ["Noob", "Débutant", "Intermédiaire", "Expert", "Impossible"]) expect(html).toContain(label);
    expect(html).toContain("Impossible : 140 MPM et plus");
  });
});
