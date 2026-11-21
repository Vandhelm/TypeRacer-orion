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
  { name: "Thon_Rouge", color: "#4ae07a", bot: true, level: "intermediate" },
];
const renderTicket = (state: Partial<RoomState>, language: "fr" | "en" = "fr") =>
  renderToString(createElement(I18nextProvider, { i18n: createI18n(language) }, createElement(RoomTicket, { state: state as RoomState })));
const ticketState = (host: boolean, extra: Record<string, unknown> = {}) =>
  ({ room: { ...DEFAULT_SETTINGS, guests: 3, bots: true, botList: [{ name: "Thon_Rouge", level: "intermediate" }], ...extra }, seats: SEATS, players: SEATS, humans: 2, host, update: () => {}, displayName: "Salon test" }) as unknown as RoomState;
const ticket = (language: "fr" | "en") => renderTicket(ticketState(true), language).match(/<li[\s\S]*?<\/li>/g) ?? [];

describe("BOT-04 — the waiting room marks a bot as such, and only bots", () => {
  test("on the ticket, the bot (in its own section) carries the BOT marker; the human seats do not", () => {
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

describe("CONF-10 — the bots are set up in the ticket, each with its level and accuracy", () => {
  const botList = [{ name: "Ebi_Fry", level: "expert", accuracy: "high" }, { name: "Uni_Kun", level: "beginner" }];
  const seats: Seat[] = [{ name: "Corail_418", color: "red", host: true }, { name: "Ebi_Fry", color: "blue", bot: true, level: "expert" }];
  const part = (host: boolean, bots = true) => {
    const html = renderTicket({ room: { ...DEFAULT_SETTINGS, guests: 2, bots, botList: bots ? botList : [] }, host, seats, humans: 1, update: () => {}, displayName: "Salon" } as unknown as RoomState);
    return html.match(/aria-labelledby="ticket-bots"[\s\S]*?<\/section>/)?.[0] ?? html;
  };
  const settings = (host: boolean) =>
    renderToString(createElement(I18nextProvider, { i18n: createI18n("fr") }, createElement(RoomSettings, { state: { room: { ...DEFAULT_SETTINGS, bots: true }, host, seats: [], update: () => {} } as unknown as RoomState, onEditText: () => {}, action: null })));

  test("the host sees every bot, a remove button each, and no add button once the room is full", () => {
    const html = part(true);
    expect(html).toContain("Ebi_Fry");
    expect(html).toContain("Uni_Kun");
    expect(html.match(/Retirer Ebi_Fry|Retirer Uni_Kun/g)).toHaveLength(2);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Un bot de plus/);
  });

  test("a bot without a seat is marked as waiting for one", () => {
    expect(part(true)).toContain("En attente d&#x27;une place");
  });

  test("BOT-01 — the host picks each bot's level among the five and its accuracy among three, the current ones selected", () => {
    const html = part(true);
    const level = html.match(/<select[^>]*aria-label="Niveau de Ebi_Fry"[\s\S]*?<\/select>/)?.[0] ?? "";
    expect([...level.matchAll(/value="([^"]+)"/g)].map((m) => m[1])).toEqual(["noob", "beginner", "intermediate", "expert", "impossible"]);
    expect(level).toMatch(/<option value="expert" selected="">/);
    const accuracy = html.match(/<select[^>]*aria-label="Précision de Ebi_Fry"[\s\S]*?<\/select>/)?.[0] ?? "";
    expect([...accuracy.matchAll(/value="([^"]+)"/g)].map((m) => m[1])).toEqual(["shaky", "decent", "high"]);
    expect(accuracy).toMatch(/<option value="high" selected="">/);
    // sans précision propre, celle du salon
    expect(html).toMatch(/aria-label="Précision de Uni_Kun"[\s\S]*?<option value="decent" selected="">/);
  });

  test("a member reads each bot's level and accuracy, without controls", () => {
    const html = part(false);
    expect(html).toContain("Expert · Haute");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("Retirer");
    expect(html).not.toContain("Un bot de plus");
  });

  test("bots turned off: the ticket says so and offers no add button", () => {
    const html = part(true, false);
    expect(html).toContain("Bots désactivés");
    expect(html).not.toContain("Un bot de plus");
  });

  test("the settings keep only an on/off checkbox, and no bots tab", () => {
    const html = settings(true);
    expect(html).not.toContain('id="tab-bots"');
    const box = (h: string) => h.match(/<input[^>]*name="bots"[^>]*>/)?.[0] ?? "";
    expect(box(html)).toContain('type="checkbox"');
    expect(box(html)).toContain('checked=""');
    expect(box(settings(false))).toContain('disabled=""');
  });
});

describe("SALLE-01 — the ticket lists the spectators in their own section", () => {
  test("each spectator by name, the host marked", () => {
    const html = renderTicket({ ...ticketState(true), spectators: [{ key: "guest:a", name: "Nori", host: true, role: "spectator" }] } as unknown as RoomState);
    expect(html).toMatch(/Spectateurs[\s\S]*Nori[\s\S]*HÔTE/);
  });

  test("none: the section says so", () => {
    expect(renderTicket(ticketState(true))).toContain("Aucun spectateur");
  });
});
