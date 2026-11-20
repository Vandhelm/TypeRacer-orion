import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../i18n";
import { DEFAULT_SETTINGS } from "../../rooms/settings";
import type { RoomState } from "../room/hooks/useRoom";
import type { Player } from "../room/room";
import { GameScreen } from "./GamePage";

const PLAYERS: Player[] = [
  { name: "Corail_418", color: "#e05a4a", me: true },
  { name: "Maki_Test", color: "#4a7ae0" },
  { name: "Thon_Rouge", color: "#4ae07a", bot: true },
];
const state = (role: "player" | "spectator", players = PLAYERS) =>
  ({
    displayName: "Salon test",
    leave: () => {},
    finish: () => {},
    role,
    members: [],
    room: { ...DEFAULT_SETTINGS, code: "ABC234" },
    players,
  }) as unknown as RoomState;
const render = (s: RoomState, language: "fr" | "en" = "fr") =>
  renderToString(createElement(I18nextProvider, { i18n: createI18n(language) }, createElement(GameScreen, { state: s, mobile: false })));
const lanes = (html: string) => html.match(/<li[^>]*data-lane[\s\S]*?<\/li>/g) ?? [];

describe("COURSE-05 — the track shows every participant with avatar, name, position and WPM", () => {
  test("one lane per participant, human or bot, each with its avatar, name, rank and WPM", () => {
    const rows = lanes(render(state("player")));
    expect(rows).toHaveLength(3);
    rows.forEach((row, i) => {
      expect(row).toContain(PLAYERS[i]!.name);
      expect(row).toContain("<svg"); // l'avatar généré
      expect(row).toContain("1re"); // personne n'a encore avancé : tous premiers ex aequo
      expect(row).toMatch(/0\s*(<!-- -->)?\s*MPM/);
    });
  });

  test("an account's photo replaces the generated avatar in its lane", () => {
    const photo = "data:image/webp;base64,UklGRg==";
    const rows = lanes(render(state("player", [{ ...PLAYERS[0]!, image: photo }, ...PLAYERS.slice(1)])));
    expect(rows[0]).toContain(`src="${photo}"`);
    expect(rows[0]).not.toContain("<svg");
    expect(rows[1]).toContain("<svg");
  });

  test("a photo that was not resized by the server falls back to the generated avatar", () => {
    const rows = lanes(render(state("player", [{ ...PLAYERS[0]!, image: "https://example.com/x.png" }])));
    expect(rows[0]).not.toContain("example.com");
    expect(rows[0]).toContain("<svg");
  });
});

/** Les classes d'un élément du couloir, repéré par son attribut data-part. */
const part = (row: string, name: string) => row.match(new RegExp(`<[a-z]+ [^>]*data-part="${name}"[^>]*>`))?.[0] ?? "";

describe("COURSE-05 — everything stays inside its lane, from 2 to 8 lanes", () => {
  const eight: Player[] = Array.from({ length: 8 }, (_, i) => ({ name: i ? `Participant_${i}` : "Corail_418_long", color: "#fff", me: i === 0 || undefined, bot: i > 3 || undefined }));
  const rows = lanes(render(state("player", eight), "en"));

  test("a lane clips what does not fit instead of spilling into its neighbour", () => {
    expect(rows).toHaveLength(8);
    rows.forEach((row) => expect(row.slice(0, row.indexOf(">"))).toMatch(/\bmin-w-0\b[\s\S]*\boverflow-hidden\b|\boverflow-hidden\b[\s\S]*\bmin-w-0\b/));
  });

  test("rank and WPM are separate pieces that wrap onto two lines", () => {
    const stats = part(rows[1]!, "stats");
    expect(stats).toContain("flex-wrap");
    expect(part(rows[1]!, "rank")).toContain("whitespace-nowrap");
    expect(part(rows[1]!, "wpm")).toContain("whitespace-nowrap");
  });

  test("narrow lanes drop the WPM and the avatar first; the rank is never hidden", () => {
    expect(part(rows[1]!, "wpm")).toMatch(/\[@container\(max-width:\d+px\)\]:hidden/);
    expect(part(rows[1]!, "avatar")).toMatch(/\[@container\(max-width:\d+px\)\]:hidden/);
    expect(part(rows[1]!, "rank")).not.toContain(":hidden");
  });

  test("the local name wraps instead of being covered: the YOU badge sits outside the name line", () => {
    const name = rows[0]!.match(/<p [^>]*data-part="name"[^>]*>[\s\S]*?<\/p>/)?.[0] ?? "";
    expect(name).toContain("Corail_418_long");
    expect(name).not.toContain("YOU");
    expect(part(rows[0]!, "label")).toMatch(/\[overflow-wrap:anywhere\]/);
    expect(rows[0]).toContain("YOU");
  });
});

describe("COURSE-05 — the local player stands out; a spectator watches without typing", () => {
  test("in English, the rank and WPM are translated", () => {
    const row = lanes(render(state("player"), "en"))[0]!;
    expect(row).toContain("1st");
    expect(row).toContain("WPM");
  });

  test("the local player's lane is clearly marked, and only theirs", () => {
    const rows = lanes(render(state("player")));
    expect(rows[0]).toContain('aria-current="true"');
    expect(rows[0]).toContain("TOI");
    expect(rows[1]).not.toContain("aria-current");
    expect(rows[2]).not.toContain("aria-current");
  });

  test("a spectator sees the track, without typing field", () => {
    const html = render(state("spectator", PLAYERS.slice(1)));
    expect(lanes(html)).toHaveLength(2);
    expect(html).toContain("Maki_Test");
    expect(html).not.toMatch(/<(input|textarea)/);
    expect(html).not.toContain('aria-current="true"');
    expect(html).toContain("Tu regardes la course");
  });

  test("a spectator in English is told they are watching", () => {
    expect(render(state("spectator", PLAYERS.slice(1)), "en")).toContain("You are watching the race");
  });

  test("a player still has the typing field", () => {
    expect(render(state("player"))).toMatch(/<(input|textarea)/);
  });
});
