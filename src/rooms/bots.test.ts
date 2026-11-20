import { describe, expect, test } from "bun:test";
import { BOT_NAMES } from "../players/bots";
import { BOT_LEVELS, BotListSchema, canAddBot, defaultBots, nextBotName, resolveBots, seatedBots } from "./bots";
import { DEFAULT_SETTINGS, RoomSettingsSchema } from "./settings";

describe("CONF-10 — the bot list of a room (names from the closed list, one level each)", () => {
  test("the levels are the five of BOT-01, without the room-wide mix", () => {
    expect([...BOT_LEVELS]).toEqual(["noob", "beginner", "intermediate", "expert", "impossible"]);
  });

  test("a list of bots, each with its own level, is valid", () => {
    expect(BotListSchema.safeParse([{ name: "Wasabi99", level: "beginner" }, { name: "Ebi_Fry", level: "expert" }]).success).toBe(true);
  });

  test("a name outside the closed list, an unknown level, an extra field or a duplicate is refused", () => {
    expect(BotListSchema.safeParse([{ name: "Moi_Meme", level: "beginner" }]).success).toBe(false);
    expect(BotListSchema.safeParse([{ name: "Wasabi99", level: "mixed" }]).success).toBe(false);
    expect(BotListSchema.safeParse([{ name: "Wasabi99", level: "beginner", bot: true }]).success).toBe(false);
    expect(BotListSchema.safeParse([{ name: "Wasabi99", level: "beginner" }, { name: "Wasabi99", level: "expert" }]).success).toBe(false);
    expect(BotListSchema.safeParse([{ name: null, level: "beginner" }]).success).toBe(false);
    expect(BotListSchema.safeParse("Wasabi99").success).toBe(false);
  });

  test("the room settings carry the list, empty by default", () => {
    expect(DEFAULT_SETTINGS.botList).toEqual([]);
    expect(RoomSettingsSchema.partial().safeParse({ botList: [{ name: "Uni_Kun", level: "intermediate" }] }).success).toBe(true);
  });

  test("the next bot takes the first free name of the closed list; none once all are taken", () => {
    expect(nextBotName([])).toBe(BOT_NAMES[0]);
    expect(nextBotName([{ name: BOT_NAMES[0], level: "beginner" }, { name: BOT_NAMES[2], level: "beginner" }])).toBe(BOT_NAMES[1]);
    expect(nextBotName(BOT_NAMES.map((name) => ({ name, level: "beginner" as const })))).toBeNull();
  });

  test("a bot can be added only while a seat is free (capacity minus the humans who race and the bots)", () => {
    expect(canAddBot({ guests: 4, botList: [{ name: "Wasabi99", level: "beginner" }] }, 2)).toBe(true);
    expect(canAddBot({ guests: 4, botList: [{ name: "Wasabi99", level: "beginner" }, { name: "Ebi_Fry", level: "beginner" }] }, 2)).toBe(false);
  });

  test("the old setting (bots on) becomes one bot per free seat, at the room speed; a mix alternates the levels", () => {
    expect(defaultBots(2, "fast")).toEqual([{ name: BOT_NAMES[0], level: "expert" }, { name: BOT_NAMES[1], level: "expert" }]);
    expect(defaultBots(4, "mixed").map((bot) => bot.level)).toEqual(["beginner", "intermediate", "expert", "beginner"]);
    expect(defaultBots(40, "slow")).toHaveLength(BOT_NAMES.length);
    expect(defaultBots(-1, "slow")).toEqual([]);
  });

  test("the bots that race: the list in order, as many as free seats; none when bots are off", () => {
    const botList = [{ name: "Wasabi99", level: "beginner" }, { name: "Ebi_Fry", level: "expert" }, { name: "Uni_Kun", level: "intermediate" }] as const;
    expect(seatedBots({ guests: 4, bots: true, botList: [...botList] }, 2).map((bot) => bot.name)).toEqual(["Wasabi99", "Ebi_Fry"]);
    expect(seatedBots({ guests: 4, bots: false, botList: [...botList] }, 1)).toEqual([]);
    expect(seatedBots({ guests: 2, bots: true, botList: [...botList] }, 3)).toEqual([]);
  });
});

describe("CONF-10 — the server resolves a change of the bots", () => {
  const current = { ...DEFAULT_SETTINGS, guests: 4, bots: true, botList: [{ name: "Wasabi99" as const, level: "beginner" as const }] };

  test("a new list replaces the old one, and bots are on exactly when it is not empty", () => {
    expect(resolveBots(current, { botList: [] }, 1)).toEqual({ bots: false, botList: [] });
    expect(resolveBots(current, { botList: [{ name: "Ebi_Fry", level: "expert" }] }, 1)).toEqual({ bots: true, botList: [{ name: "Ebi_Fry", level: "expert" }] });
  });

  test("a list that grows beyond the free seats is refused; removing or changing a level never is", () => {
    const three = [{ name: "Wasabi99", level: "beginner" }, { name: "Ebi_Fry", level: "expert" }, { name: "Uni_Kun", level: "intermediate" }] as const;
    expect(resolveBots(current, { botList: [...three] }, 2)).toBe("full");
    const crowded = { ...current, botList: [...three] };
    // 2 humans + 3 bots in 4 seats (a human came in after): the host may still remove one, or change a level
    expect(resolveBots(crowded, { botList: [three[0], three[1]] }, 2)).toEqual({ bots: true, botList: [three[0], three[1]] });
    expect(resolveBots(crowded, { botList: [{ name: "Wasabi99", level: "expert" }, three[1], three[2]] }, 2)).not.toBe("full");
  });

  test("the old toggle still works: off empties the list, on fills the free seats when the list is empty", () => {
    expect(resolveBots(current, { bots: false }, 1)).toEqual({ bots: false, botList: [] });
    const empty = { ...current, bots: false, botList: [] };
    expect(resolveBots(empty, { bots: true }, 1)).toEqual({ bots: true, botList: defaultBots(3, current.botSpeed) });
    expect(resolveBots(current, { bots: true }, 1)).toEqual({ bots: true, botList: current.botList });
  });

  test("full old settings (bots on, empty list, as DEFAULT_SETTINGS) still fill the free seats", () => {
    const empty = { ...current, bots: false, botList: [] };
    expect(resolveBots(empty, { ...DEFAULT_SETTINGS, guests: 3 }, 1)).toEqual({ bots: true, botList: defaultBots(2, DEFAULT_SETTINGS.botSpeed) });
    expect(resolveBots(empty, { botList: [{ name: "Ebi_Fry", level: "expert" }], bots: false }, 1)).toEqual({ bots: false, botList: [] });
  });

  test("another change keeps the list as it is", () => {
    expect(resolveBots(current, { guests: 6 }, 1)).toEqual({ bots: true, botList: current.botList });
  });
});
