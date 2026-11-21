import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { TFunction } from "i18next";
import { createI18n } from "../../i18n";
import { BOT_NAMES } from "../../players/bots";
import { seatColor } from "../../rooms/seats";
import { arrivalOf, compositionOptions, DURATION_PRESETS, durationChoice, guestComposition, launchHint, raceHref, readSession, roomHrefOutsideRace, seatSpoken, seatsOf, withBotAccuracy, withBotAdded, withBotLevel, withoutBot, type Player } from "./room";

const t = ((key: string) => key) as unknown as TFunction;

describe("AUTH-03 — a guest is never the host of a room", () => {
  test("a guest opening /room?new does not get a room to host", () => {
    expect(readSession("?new", t, true)).toBeNull();
  });

  test("a guest on /room without a stored room does not become host", () => {
    expect(readSession("", t, true)).toBeNull();
  });

  test("a guest joining by code is a player, not the host", () => {
    expect(readSession("?code=ABC234", t, true)?.host).toBe(false);
  });

  test("a signed-in user still creates and hosts a room", () => {
    expect(readSession("?new", t, false)?.host).toBe(true);
  });
});

describe("SALLE-01 — seats come from the server's members", () => {
  const member = (key: string, role: "player" | "spectator", seat: number | null, host = false) => ({ key, name: key, guest: false, host, role, seat, color: seat === null ? null : `c${seat}`, finished: false });

  test("the host who spectates has no seat; the other players keep theirs", () => {
    const seats = seatsOf({ guests: 3, bots: false }, [member("player:1", "spectator", null, true), member("player:2", "player", 0)], "player:1");
    expect(seats).toEqual([{ name: "player:2", color: "c0" }, { free: true }, { free: true }]);
  });

  test("marks the host and me, and never invents a human", () => {
    const seats = seatsOf({ guests: 2, bots: true }, [member("player:1", "player", 0, true)], "player:1");
    expect(seats[0]).toMatchObject({ name: "player:1", host: true, me: true });
    expect(seats[1]).toMatchObject({ bot: true });
  });
});

describe("DES-05 — a seat's colour follows the theme", () => {
  const seated = (seat: number) => ({ key: `guest:${seat}`, name: `n${seat}`, guest: true, host: false, role: "player" as const, seat, color: seatColor(seat), finished: false });

  test("the colour the server assigned to a seat is shown through that seat's token, bots included", () => {
    const seats = seatsOf({ guests: 3, bots: true, botList: [{ name: BOT_NAMES[0], level: "beginner" }] }, [seated(0), seated(1)], "");
    expect(seats.map((s) => ("color" in s ? s.color : null))).toEqual(["var(--color-seat-1)", "var(--color-seat-2)", "var(--color-seat-3)"]);
  });
});

describe("SALLE-05 — a room of up to 30 seats", () => {
  const player = (seat: number) => ({ key: `guest:${seat}`, name: `n${seat}`, guest: true, host: false, role: "player" as const, seat, color: null, finished: false });

  test("30 seated participants each get a color, all distinct", () => {
    const seats = seatsOf({ guests: 30, bots: false }, Array.from({ length: 30 }, (_, i) => player(i)), "");
    expect(seats).toHaveLength(30);
    const colors = seats.map((s) => ("color" in s ? s.color : undefined));
    expect(colors.every(Boolean)).toBe(true);
    expect(new Set(colors).size).toBe(30);
  });

  test("with bots on, a 30-seat room gets at most one bot per bot name; the rest stay free, never an unnamed bot", () => {
    const seats = seatsOf({ guests: 30, bots: true }, [player(0)], "guest:0");
    expect(seats).toHaveLength(30);
    const bots = seats.filter((s) => "bot" in s && s.bot);
    expect(bots.every((b) => "name" in b && typeof b.name === "string" && b.name.length > 0)).toBe(true);
    expect(new Set(bots.map((b) => ("name" in b ? b.name : ""))).size).toBe(bots.length);
  });
});

describe("SALLE-09 — /game finds the launched room and never creates one", () => {
  const searches = ["", "?new", "?code=ABC234", "?invite=abc", "?code=bad!"];

  test("/game never asks to create a room, for an account or a guest", () => {
    for (const search of searches) {
      for (const guest of [true, false]) expect(arrivalOf(search, "game", guest)?.action).not.toBe("create");
    }
  });

  test("/game?code reads the launched room as a member (GET), it does not join or create", () => {
    expect(arrivalOf("?code=ABC234", "game", false)).toEqual({ action: "read", code: "ABC234" });
    expect(arrivalOf("?code=ABC234", "game", true)).toEqual({ action: "read", code: "ABC234" });
  });

  test("/game without a room code has nothing to show", () => {
    expect(arrivalOf("", "game", false)).toBeNull();
    expect(arrivalOf("?invite=abc", "game", false)).toBeNull();
  });

  test("/room keeps its arrival: an account creates, a code or a link joins", () => {
    expect(arrivalOf("", "room", false)).toEqual({ action: "create" });
    expect(arrivalOf("", "room", true)).toBeNull();
    expect(arrivalOf("?code=ABC234", "room", false)).toEqual({ action: "join", via: { code: "ABC234" } });
    expect(arrivalOf("?invite=abc", "room", true)).toEqual({ action: "join", via: { invite: "abc" } });
  });

  test("every member follows the room to its race page once it is racing", () => {
    expect(raceHref("racing", "ABC234")).toBe("/game?code=ABC234");
    expect(raceHref("waiting", "ABC234")).toBeNull();
    expect(raceHref("results", "ABC234")).toBeNull();
    expect(raceHref("racing", "")).toBeNull();
  });

  test("a member who has already finished, back on /room while others still race, is not sent to /game", () => {
    expect(raceHref("racing", "ABC234", true)).toBeNull();
    expect(raceHref("racing", "ABC234", false)).toBe("/game?code=ABC234");
  });
});

describe("JOIN-01 — a code typed by hand is checked before anything opens", () => {
  test("a well-formed code joins the room, whoever arrives", () => {
    expect(arrivalOf("?code=K7Q2M9", "room", true)).toEqual({ action: "join", via: { code: "K7Q2M9" } });
    expect(arrivalOf("?code=k7q2m9", "room", false)).toEqual({ action: "join", via: { code: "K7Q2M9" } });
  });

  test("a malformed code is refused on the page, without asking the server", () => {
    expect(arrivalOf("?code=K7Q", "room", true)).toEqual({ action: "refused", error: "bad_code" });
    expect(arrivalOf("?code=K7Q2M9X", "room", false)).toEqual({ action: "refused", error: "bad_code" });
  });

  test("a code made only of invalid characters never creates a room for an account", () => {
    expect(arrivalOf("?code=0000", "room", false)).toEqual({ action: "refused", error: "bad_code" });
    expect(arrivalOf("?code=%3Cscript%3E", "room", false)).toEqual({ action: "refused", error: "bad_code" });
  });

  test("an empty code parameter keeps the usual arrival", () => {
    expect(arrivalOf("?code=", "room", false)).toEqual({ action: "create" });
    expect(arrivalOf("?code=", "room", true)).toBeNull();
  });
});

describe("JOIN-01 — the errors of a code are written in French and English", () => {
  const fr: unknown = JSON.parse(readFileSync("src/i18n/locales/fr.json", "utf8"));
  const en: unknown = JSON.parse(readFileSync("src/i18n/locales/en.json", "utf8"));
  const at = (tree: unknown, path: string[]) => path.reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], tree);

  for (const path of [["home", "badCode"], ["room", "errors", "not_found"], ["room", "errors", "bad_code"]]) {
    test(`${path.join(".")} is a sentence in both languages, not the same one`, () => {
      const [a, b] = [at(fr, path), at(en, path)];
      expect(typeof a).toBe("string");
      expect(typeof b).toBe("string");
      expect(String(a).length).toBeGreaterThan(10);
      expect(a).not.toBe(b);
    });
  }
});

describe("SALLE-09 — /game runs a race only while the room is racing", () => {
  test("a waiting room or one on its results sends /game back to the room", () => {
    expect(roomHrefOutsideRace("waiting", "ABC234")).toBe("/room?code=ABC234");
    expect(roomHrefOutsideRace("results", "ABC234")).toBe("/room?code=ABC234");
  });

  test("a racing room stays on /game", () => {
    expect(roomHrefOutsideRace("racing", "ABC234")).toBeNull();
  });
});

describe("CONF-01 — the maximum time choice in the room settings", () => {
  test("the presets include « none » and stay between 30 s and 10 minutes", () => {
    expect(DURATION_PRESETS).toContain(null);
    for (const value of DURATION_PRESETS) if (value !== null) expect(value >= 30 && value <= 600).toBe(true);
  });

  test("no limit checks « none », a preset checks itself, any other value checks « other »", () => {
    expect(durationChoice(null, false)).toBe("none");
    expect(durationChoice(120, false)).toBe(120);
    expect(durationChoice(45, false)).toBe("other");
  });

  test("while the host types a custom value, « other » stays checked", () => {
    expect(durationChoice(null, true)).toBe("other");
    expect(durationChoice(120, true)).toBe("other");
  });
});

describe("CONF-06 — the composition options shown in the room settings", () => {
  const names = (room: Parameters<typeof compositionOptions>[0]) => compositionOptions(room).map((option) => option.name);
  const option = (room: Parameters<typeof compositionOptions>[0], name: string) => compositionOptions(room).find((o) => o.name === name);

  test("a French room offers punctuation, numbers, specials, capitals and accents", () => {
    expect(names({ textType: "words", language: "fr", punctuation: false })).toEqual(["punctuation", "numbers", "specials", "capitals", "accents"]);
  });

  test("the accents option is for French only: an English room does not show it", () => {
    expect(names({ textType: "words", language: "en", punctuation: false })).not.toContain("accents");
    expect(names({ textType: "coherent", language: "en", punctuation: false })).toContain("capitals");
  });

  test("a custom text locks every option (it is typed as written)", () => {
    expect(compositionOptions({ textType: "custom", language: "fr", punctuation: false }).every((o) => o.locked)).toBe(true);
  });

  test("capitals can be changed for every generated text, and look inactive on random words without punctuation", () => {
    for (const textType of ["coherent", "quote", "words"] as const) expect(option({ textType, language: "fr", punctuation: true }, "capitals")?.locked).toBe(false);
    expect(option({ textType: "words", language: "fr", punctuation: false }, "capitals")?.inactive).toBe(true);
    expect(option({ textType: "words", language: "fr", punctuation: true }, "capitals")?.inactive).toBe(false);
  });

  test("punctuation is only chosen for random words, as before", () => {
    expect(option({ textType: "coherent", language: "fr", punctuation: false }, "punctuation")).toEqual({ name: "punctuation", locked: true, inactive: true });
    expect(option({ textType: "words", language: "fr", punctuation: false }, "punctuation")).toEqual({ name: "punctuation", locked: false, inactive: false });
  });

  test("numbers are only chosen for random words: a coherent passage or a quote keeps its own numbers (« 1866 »)", () => {
    for (const textType of ["coherent", "quote"] as const) expect(option({ textType, language: "fr", punctuation: false }, "numbers")).toEqual({ name: "numbers", locked: true, inactive: true });
    expect(option({ textType: "words", language: "fr", punctuation: false }, "numbers")).toEqual({ name: "numbers", locked: false, inactive: false });
  });

  const flags = { punctuation: false, numbers: false, specials: false, capitals: true, accents: true };
  test("a guest sees the options that are on and have an effect", () => {
    expect(guestComposition({ textType: "words", language: "fr", ...flags, punctuation: true })).toEqual(["punctuation", "capitals", "accents"]);
  });

  test("a guest does not see capitals when they have no effect (random words without punctuation)", () => {
    expect(guestComposition({ textType: "words", language: "fr", ...flags })).toEqual(["accents"]);
  });

  test("a guest does not see numbers or punctuation left on from random words once the text is coherent", () => {
    expect(guestComposition({ textType: "coherent", language: "en", ...flags, punctuation: true, numbers: true })).toEqual(["capitals"]);
  });

  test("CONF-07: specials are only chosen for random words, greyed out and locked for a coherent text or a quote", () => {
    for (const textType of ["coherent", "quote"] as const) expect(option({ textType, language: "fr", punctuation: false }, "specials")).toEqual({ name: "specials", locked: true, inactive: true });
    expect(option({ textType: "words", language: "fr", punctuation: false }, "specials")).toEqual({ name: "specials", locked: false, inactive: false });
    expect(option({ textType: "custom", language: "fr", punctuation: false }, "specials")?.locked).toBe(true);
  });

  test("CONF-07: a guest does not see specials left on from random words once the text is a quote", () => {
    expect(guestComposition({ textType: "quote", language: "en", ...flags, specials: true })).toEqual(["capitals"]);
  });

  test("the capitals label exists in French and English", () => {
    const label = (lang: "fr" | "en") => (JSON.parse(readFileSync(`src/i18n/locales/${lang}.json`, "utf8")) as { room: Record<string, unknown> }).room.capitals;
    expect(label("fr")).toBe("Majuscules");
    expect(label("en")).toBe("Capitals");
  });
});

describe("COURSE-02 — the Launch button is greyed out with the reason, by the server's rule", () => {
  const member = (n: number, role: "player" | "spectator") => ({ key: `player:${n}`, name: `P${n}`, guest: false, host: n === 0, role, seat: role === "player" ? n : null, color: null, finished: false });

  test("1 human alone: greyed out, at least 2 participants needed", () => {
    expect(launchHint({ guests: 4, bots: false }, [member(0, "player")])).toBe("room.notEnough");
  });

  test("1 human + spectators: still greyed out, spectators do not count", () => {
    expect(launchHint({ guests: 4, bots: false }, [member(0, "player"), member(1, "spectator"), member(2, "spectator")])).toBe("room.notEnough");
  });

  test("only bots race (the host watches): greyed out, a human player is needed", () => {
    expect(launchHint({ guests: 4, bots: true }, [member(0, "spectator")])).toBe("room.noHuman");
  });

  test("1 human + bots, or 2 humans: the button is active", () => {
    expect(launchHint({ guests: 2, bots: true }, [member(0, "player")])).toBeNull();
    expect(launchHint({ guests: 2, bots: false }, [member(0, "player"), member(1, "player")])).toBeNull();
  });

  test("the button agrees with the seats shown: active exactly when 2 seats are taken and a human races", () => {
    for (const bots of [true, false])
      for (let guests = 2; guests <= 4; guests++)
        for (let humans = 0; humans <= 2; humans++) {
          const members = [...Array.from({ length: humans }, (_, i) => member(i, "player")), member(9, "spectator")];
          const taken = seatsOf({ guests, bots }, members, "").filter((s) => !("free" in s)).length;
          expect(launchHint({ guests, bots }, members) === null).toBe(humans >= 1 && taken >= 2);
        }
  });

  test("the hints and the server refusal are translated in both languages", () => {
    for (const lang of ["fr", "en"]) {
      const room = JSON.parse(readFileSync(`src/i18n/locales/${lang}.json`, "utf8")).room;
      expect(room.notEnough).toBeTruthy();
      expect(room.noHuman).toBeTruthy();
      expect(room.errors.not_enough_players).toBeTruthy();
    }
  });
});

describe("BOT-04 — the spoken list of players says which ones are bots", () => {
  const fr = createI18n("fr").t;
  const en = createI18n("en").t;

  test("a bot is read with a full word, in French and in English", () => {
    const bot = { name: "Thon_Rouge", color: "green", bot: true };
    expect(seatSpoken(fr, bot)).toBe("Thon_Rouge, bot, joueur automatique");
    expect(seatSpoken(en, bot)).toBe("Thon_Rouge, bot, computer player");
  });

  test("a seated human whose nickname is a bot's name is not marked as a bot: the mark comes from the seat, not the name", () => {
    const member = { key: "guest:abc", name: "Thon_Rouge", guest: true, host: false, role: "player" as const, seat: 0, color: null, finished: false };
    const [human, bot] = seatsOf({ guests: 2, bots: true }, [member], "player:1");
    expect(human).not.toHaveProperty("bot");
    expect(seatSpoken(fr, human as Player)).toBe("Thon_Rouge");
    expect((bot as Player).bot).toBe(true);
  });

  test("a human is never read as a bot", () => {
    expect(seatSpoken(fr, { name: "Maki_Test", color: "blue" })).toBe("Maki_Test");
    expect(seatSpoken(fr, { name: "Corail_418", color: "red", host: true, me: true })).toBe("Corail_418, Hôte, TOI");
  });
});

describe("CONF-10 — the seats show the bots of the room's list, each with its level", () => {
  const member = (key: string, seat: number) => ({ key, name: key, guest: false, host: seat === 0, role: "player" as const, seat, color: `c${seat}`, finished: false });
  const botList = [{ name: "Ebi_Fry", level: "expert" }, { name: "Wasabi99", level: "beginner" }] as const;

  test("the bots follow the list, with their level, after the humans", () => {
    const seats = seatsOf({ guests: 4, bots: true, botList: [...botList] }, [member("player:1", 0)], "player:1");
    expect(seats.slice(1)).toEqual([
      { name: "Ebi_Fry", color: expect.any(String), bot: true, level: "expert" },
      { name: "Wasabi99", color: expect.any(String), bot: true, level: "beginner" },
      { free: true },
    ]);
  });

  test("a bot without a seat (a human came in after it) does not race", () => {
    const seats = seatsOf({ guests: 2, bots: true, botList: [...botList] }, [member("player:1", 0)], "player:1");
    expect(seats.filter((s) => "bot" in s && s.bot).map((s) => ("name" in s ? s.name : ""))).toEqual(["Ebi_Fry"]);
  });

  test("the launch hint counts the bots of the list", () => {
    expect(launchHint({ guests: 4, bots: true, botList: [] }, [{ role: "player" }])).toBe("room.notEnough");
    expect(launchHint({ guests: 4, bots: true, botList: [botList[0]] }, [{ role: "player" }])).toBeNull();
  });
});

describe("CONF-10 — the host edits the bot list one bot at a time", () => {
  const list = [{ name: "Thon_Rouge", level: "beginner" }, { name: "Saba_Sensei", level: "expert" }] as const;

  test("adding a bot takes the next free name, at the medium level and decent accuracy", () => {
    expect(withBotAdded([...list])).toEqual([...list, { name: "Wasabi99", level: "intermediate", accuracy: "decent" }]);
  });

  test("changing one bot's accuracy leaves the others as they are", () => {
    expect(withBotAccuracy([...list], "Saba_Sensei", "shaky")).toEqual([list[0], { ...list[1], accuracy: "shaky" }]);
  });

  test("adding when every name is taken changes nothing", () => {
    const full = BOT_NAMES.map((name) => ({ name, level: "beginner" as const }));
    expect(withBotAdded(full)).toBe(full);
  });

  test("removing a bot keeps the others in order", () => {
    expect(withoutBot([...list], "Thon_Rouge")).toEqual([list[1]]);
  });

  test("changing one bot's level leaves the other one", () => {
    expect(withBotLevel([...list], "Saba_Sensei", "intermediate")).toEqual([list[0], { name: "Saba_Sensei", level: "intermediate" }]);
  });
});
