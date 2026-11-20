import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../i18n";
import type { RealtimeState } from "../../realtime/client";
import { createCourse, createRace, type Race } from "../game/race";
import type { RaceLanes } from "../game/track";
import type { Player } from "../room/room";
import { awaitingMeasures, errorCount, isMeasured, laneBonuses, playerStatus, withMeasures } from "./board";
import { PodiumBoard } from "./PodiumBoard";
import { parseRace } from "../../server/races";
import { buildResults, finalRanking, parseResults, raceBody, type PlayerResult, type RaceSummary } from "./results";

const player = (name: string, patch: Partial<PlayerResult> = {}): PlayerResult => ({
  name, rank: 1, me: false, bot: false, wpm: 50, raw: 55, accuracy: 96, seconds: 42, chars: [120, 3, 1, 2], consistency: 80, idle: 0,
  finished: true, eliminated: false, wpmSeries: [], rawSeries: [], errorSeries: [], keys: {}, ...patch,
});

describe("RES-02 — status of each participant: finished, time up, abandoned, eliminated", () => {
  test("a finished player is finished", () => {
    expect(playerStatus(player("A"))).toBe("finished");
  });
  test("a player who did not finish and did not leave ran out of time", () => {
    expect(playerStatus(player("A", { finished: false }))).toBe("timeout");
  });
  test("an abandon wins over everything else, even a stale finished flag", () => {
    expect(playerStatus(player("A", { finished: true, abandoned: true }))).toBe("abandoned");
  });
  test("a fatal mistake (fatal mode) is an elimination", () => {
    expect(playerStatus(player("A", { finished: false, eliminated: true }))).toBe("eliminated");
  });
});

describe("RES-02 — number of errors and measured lines", () => {
  test("errors are the wrong, extra and missed characters", () => {
    expect(errorCount(player("A", { chars: [120, 3, 1, 2] }))).toBe(6);
  });
  test("a broken chars field counts as no error, never NaN", () => {
    expect(errorCount(player("A", { chars: [Number.NaN, -1, 0, 0] as PlayerResult["chars"] }))).toBe(0);
  });
  test("another human's live line (only relayed WPM) is not measured; me, a bot or a typed line is", () => {
    expect(isMeasured(player("Other", { raw: 0, chars: [0, 0, 0, 0] }))).toBe(false);
    expect(isMeasured(player("Me", { me: true, raw: 0, chars: [0, 0, 0, 0] }))).toBe(true);
    expect(isMeasured(player("Bot", { bot: true, raw: 0, chars: [0, 0, 0, 0] }))).toBe(true);
    expect(isMeasured(player("Hist", { raw: 40 }))).toBe(true);
  });
});

const PLAYERS: Player[] = [
  { name: "Moi", color: "red", me: true },
  { name: "Autre", color: "blue" },
  { name: "Bip", color: "green", bot: true },
];
const LANES: RaceLanes = { players: PLAYERS, keys: ["player:1", "guest:abc", null] };
const live = (patch: Partial<RealtimeState>) => patch as RealtimeState;
const standing = (playerId: string, bonuses?: number) => ({ playerId, rank: 1, progress: 0.5, wpm: 40, finishedMs: null, ...(bonuses === undefined ? {} : { bonuses }) });
const bonus = (playerId: string, count: number, kind?: "fog" | "fewer_words" | "extra_words") => ({
  type: "bonus" as const, room: "ABC234", playerId, checkpoint: count, count,
  ...(kind === "fog" ? { effect: { kind, target: "u:2", durationMs: 5000 } } : kind === "fewer_words" ? { effect: { kind, target: playerId, removed: 3 } } : kind === "extra_words" ? { effect: { kind, target: "u:2", words: ["a", "b", "c"] } } : {}),
});

describe("RES-02 — bonuses received, from the server (bonus messages and standings)", () => {
  test("bonuses off (no count in the standings, no bonus message): unknown, undefined", () => {
    expect(laneBonuses(live({ race: { startsAt: 0, endsAt: null, standings: [standing("u:1")] } }), LANES)).toBeUndefined();
    expect(laneBonuses(null, LANES)).toBeUndefined();
  });

  test("each lane gets the bonuses awarded to its runner, with their kinds; a bot gets none", () => {
    const state = live({
      bonuses: [bonus("u:1", 1, "fog"), bonus("g:abc", 1, "fewer_words"), bonus("u:1", 2, "extra_words")],
      race: { startsAt: 0, endsAt: null, standings: [standing("u:1", 2), standing("g:abc", 1)] },
    });
    expect(laneBonuses(state, LANES)).toEqual([{ count: 2, kinds: ["fog", "extra_words"] }, { count: 1, kinds: ["fewer_words"] }, { count: 0, kinds: [] }]);
  });

  test("the standings count wins when messages were lost (reconnection); a bonus without effect has no kind", () => {
    const state = live({ bonuses: [bonus("u:1", 2)], race: { startsAt: 0, endsAt: null, standings: [standing("u:1", 3), standing("g:abc", 0)] } });
    expect(laneBonuses(state, LANES)).toEqual([{ count: 3, kinds: [] }, { count: 0, kinds: [] }, { count: 0, kinds: [] }]);
  });

  test("a bonus for an unknown runner or a spectator is not given to any lane", () => {
    const state = live({ bonuses: [bonus("u:99", 1, "fog")], race: { startsAt: 0, endsAt: null, standings: [standing("u:99", 1)] } });
    expect(laneBonuses(state, LANES)).toEqual([{ count: 0, kinds: [] }, { count: 0, kinds: [] }, { count: 0, kinds: [] }]);
  });
});

describe("RES-02 — buildResults keeps the bonuses received and they survive the hand-over to the podium", () => {
  const race = (): Race => ({ ...createRace(createCourse(["le", "riz"], 60, "fix"), PLAYERS, "medium", "high", () => 0.5), phase: "done", startedAt: 1000, now: 61000 });

  test("each line carries the bonuses of its lane", () => {
    const built = buildResults(race(), PLAYERS, [{ count: 2, kinds: ["fog", "extra_words"] }, { count: 1, kinds: [] }, { count: 0, kinds: [] }]);
    expect(built.find((p) => p.name === "Moi")!.bonuses).toEqual({ count: 2, kinds: ["fog", "extra_words"] });
    expect(built.find((p) => p.name === "Bip")!.bonuses).toEqual({ count: 0, kinds: [] });
  });

  test("without bonuses (off or unknown), no line has the field", () => {
    expect(buildResults(race(), PLAYERS).every((p) => !("bonuses" in p))).toBe(true);
  });

  test("parseResults keeps valid bonuses and drops forged ones", () => {
    const stored = (bonuses: unknown) => JSON.stringify({ summary: {}, players: [{ ...player("A"), bonuses }] });
    expect(parseResults(stored({ count: 2, kinds: ["fog", "nope", 3] }))!.players[0]!.bonuses).toEqual({ count: 2, kinds: ["fog"] });
    expect(parseResults(stored({ count: -1, kinds: [] }))!.players[0]!.bonuses).toBeUndefined();
    expect(parseResults(stored({ count: 1e9, kinds: [] }))!.players[0]!.bonuses).toBeUndefined();
    expect(parseResults(stored("3"))!.players[0]!.bonuses).toBeUndefined();
    expect(parseResults(stored(undefined))!.players[0]!.bonuses).toBeUndefined();
  });

  test("the server still accepts a race whose lines carry bonuses (it does not keep them: HIST-02 shows « — »)", () => {
    const summary = { textType: "words", language: "fr", duration: 60, level: "common", punctuation: false, numbers: false, specials: false, accents: true, excluded: "", mistakes: "fix", botSpeed: "medium", botAccuracy: "high", length: "short", wordCount: 2, sessionSeconds: 60 } as RaceSummary;
    const players = buildResults(race(), PLAYERS, [{ count: 1, kinds: ["fog"] }, { count: 0, kinds: [] }, { count: 0, kinds: [] }]);
    const parsed = parseRace(raceBody({ players, summary }, "le riz"));
    expect(parsed.results.every((p) => !("bonuses" in p))).toBe(true);
  });

  test("finalRanking keeps the bonuses of each line", () => {
    expect(finalRanking([player("A", { bonuses: { count: 1, kinds: ["fog"] } })])[0]!.bonuses).toEqual({ count: 1, kinds: ["fog"] });
  });
});

const PLAYERS_SHOWN = [
  player("Moi_Ssr", { rank: 1, me: true, wpm: 72, raw: 80, accuracy: 97.5, seconds: 38, chars: [200, 4, 1, 0], bonuses: { count: 2, kinds: ["fog", "fewer_words"] } }),
  player("Nori_Ninja", { rank: 2, bot: true, wpm: 60, raw: 66, accuracy: 93, seconds: 60, finished: false, chars: [150, 9, 0, 0], bonuses: { count: 0, kinds: [] } }),
  player("Parti", { rank: 3, wpm: 20, raw: 0, accuracy: 0, seconds: 0, finished: false, abandoned: true, chars: [0, 0, 0, 0] }),
  player("Fatal", { rank: 4, wpm: 10, raw: 12, seconds: 9, finished: false, eliminated: true, chars: [20, 1, 0, 0] }),
];
const render = (language: "fr" | "en", players = PLAYERS_SHOWN) =>
  renderToString(createElement(I18nextProvider, { i18n: createI18n(language) }, createElement(PodiumBoard, { players, showPlace: true, arrived: true })));
const rows = (html: string) => html.match(/<tbody[\s\S]*<\/tbody>/)![0].match(/<tr[\s\S]*?<\/tr>/g) ?? [];

describe("RES-02 — the podium shows a real, accessible table with every column", () => {
  test("a table with a caption, column headers (scope=col) and one row header (scope=row) per participant", () => {
    const html = render("fr");
    expect(html).toContain("<table");
    expect(html).toMatch(/<caption[^>]*>/);
    expect(html.match(/<th[^>]*scope="col"/g)).toHaveLength(9);
    expect(rows(html)).toHaveLength(4);
    for (const row of rows(html)) expect(row).toMatch(/<th[^>]*scope="row"/);
    expect(html).not.toContain("<ol");
  });

  test("the headers name every column asked for, in French and English", () => {
    const heads = (html: string) => (html.match(/<thead[\s\S]*<\/thead>/)![0].match(/<th[^>]*>[\s\S]*?<\/th>/g) ?? []).map((th) => th.replace(/<[^>]+>/g, ""));
    expect(heads(render("fr"))).toEqual(["Rang", "Participant", "MPM", "MPM brut", "Précision", "Erreurs", "Temps", "Statut", "Bonus reçus"]);
    expect(heads(render("en"))).toEqual(["Rank", "Player", "WPM", "Raw WPM", "Accuracy", "Errors", "Time", "Status", "Bonuses received"]);
  });

  test("each row shows rank, name, WPM, raw WPM, accuracy, errors, time, status and bonuses", () => {
    const text = (row: string) => row.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|");
    const [me, bot, left, fatal] = rows(render("fr")).map(text);
    expect(me).toMatch(/1re\|Moi_Ssr · TOI\|72\|80\|97,5 %\|5\|38 s\|arrivé\|2 · Brouillard, −3 mots\|/);
    expect(bot).toMatch(/2e\|Nori_Ninja\|BOT\|.*\|60\|66\|93 %\|9\|60 s\|temps écoulé\|0\|/);
    expect(left).toMatch(/Parti\|20\|—\|inconnu\|—\|inconnu\|—\|inconnu\|—\|inconnu\|abandon\|—\|inconnu\|/);
    expect(fatal).toMatch(/éliminé/);
  });

  test("in English, statuses and bonus kinds are translated", () => {
    const html = render("en");
    for (const word of ["finished", "time up", "abandoned", "eliminated", "Fog", "−3 words"]) expect(html).toContain(word);
  });

  test("the participant links to their stats, as before", () => {
    expect(rows(render("fr"))[1]).toContain('href="/profile?player=1"');
  });

  test("at 360 px the table scrolls inside its own frame, not the page", () => {
    const html = render("fr");
    expect(html).toMatch(/<div[^>]*class="[^"]*overflow-auto[^"]*"[^>]*><table/);
  });
});

describe("RES-02 — another human's raw WPM, accuracy and errors come from his own recorded race", () => {
  const live = player("Autre", { wpm: 48, raw: 0, accuracy: 100, seconds: 40, chars: [0, 0, 0, 0] });
  const me = player("Moi", { me: true, raw: 70 });

  test("a line still unmeasured is waiting; me, bots and measured lines are not", () => {
    expect(awaitingMeasures([me, live])).toBe(true);
    expect(awaitingMeasures([me, player("Bip", { bot: true, raw: 0, chars: [0, 0, 0, 0] })])).toBe(false);
  });

  test("an abandon rebuilt by the server (no lane, no measure) is not waited for", () => {
    expect(awaitingMeasures(finalRanking([me], [{ name: "Parti" }]))).toBe(false);
  });

  test("the recorded measures fill the unmeasured line, matched by name in any case; rank, WPM and status stay", () => {
    const filled = withMeasures([me, live], [player("AUTRE", { raw: 52, accuracy: 94.5, chars: [180, 7, 1, 2], wpm: 1, rank: 9, finished: false })]);
    expect(filled[1]).toMatchObject({ name: "Autre", raw: 52, accuracy: 94.5, chars: [180, 7, 1, 2], wpm: 48, rank: 1, finished: true });
  });

  test("a recorded line still unmeasured, a bot or my own line is never copied over", () => {
    const players = [me, live];
    expect(withMeasures(players, [player("Autre", { raw: 0, chars: [0, 0, 0, 0] })])).toBe(players);
    expect(withMeasures(players, [player("Moi", { raw: 1, chars: [1, 0, 0, 0] })])).toBe(players);
  });

  test("once filled, the board shows the three columns instead of « — »", () => {
    const filled = withMeasures([me, live], [player("Autre", { raw: 52, accuracy: 94, chars: [180, 7, 1, 2] })]);
    const row = rows(render("fr", filled))[1]!.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|");
    expect(row).toMatch(/Autre\|48\|52\|94 %\|10\|40 s\|/);
  });
});

describe("RES-02 — an abandon rebuilt by the server has no time and no speed", () => {
  test("its WPM and time cells show « — », not 0 and « 0 s »", () => {
    const ranked = finalRanking([player("Moi", { me: true })], [{ name: "Parti" }]);
    const row = rows(render("fr", ranked)).find((r) => r.includes("Parti"))!.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|");
    expect(row).toMatch(/Parti\|—\|inconnu\|—\|inconnu\|—\|inconnu\|—\|inconnu\|—\|inconnu\|abandon\|/);
    expect(row).not.toContain("0 s");
  });

  test("a live human who really ran keeps his WPM and time", () => {
    const row = rows(render("fr", [player("Autre", { wpm: 48, raw: 0, seconds: 40, chars: [0, 0, 0, 0] })]))[0]!.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|");
    expect(row).toMatch(/Autre\|48\|—\|inconnu\|—\|inconnu\|—\|inconnu\|40 s\|/);
  });
});
