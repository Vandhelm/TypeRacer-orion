import { describe, expect, test } from "bun:test";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../i18n";
import { generatedAvatar } from "../../players/avatar";
import type { BonusAnnouncement } from "./announce";
import { BonusNotice } from "./BonusNotice";
import { RaceTrack } from "./RaceTrack";
import type { TrackLane } from "./track";

const lane = (i: number, name: string, me = false): TrackLane => ({ lane: i, name, me, bot: false, avatar: generatedAvatar(name), photo: null, progress: 0.3, wpm: 40, rank: i + 1, finished: false });
const LANES = [lane(0, "Corail_418", true), lane(1, "Maki_Test"), lane(2, "Saumon_7")];
const announcement = (a: Partial<BonusAnnouncement>): BonusAnnouncement => ({ key: "1:u:40", kind: "extra_words", count: 3, lane: 1, from: 2, target: "Maki_Test", sender: "Saumon_7", mine: false, until: 9999, ...a });
const html = (element: ReactElement, language: "fr" | "en" = "fr") => renderToStaticMarkup(createElement(I18nextProvider, { i18n: createI18n(language) }, element));
const rows = (markup: string) => markup.match(/<li[^>]*data-lane[\s\S]*?<\/li>/g) ?? [];
const badge = (row: string) => row.match(/<b [^>]*data-part="bonus"[^>]*>([\s\S]*?)<\/b>/);
const news = (markup: string) => markup.match(/<p [^>]*data-part="bonus-news"[^>]*>([\s\S]*?)<\/p>/);

describe("BONUS-03 — the track announces the bonus on the lane it hits, for everyone", () => {
  test("+3 words on the leader: a badge on the leader's lane only", () => {
    const lanes = rows(html(createElement(RaceTrack, { lanes: LANES, bonuses: [announcement({})] })));
    expect(badge(lanes[1]!)?.[1]).toBe("+3 mots");
    expect(badge(lanes[0]!)).toBeNull();
    expect(badge(lanes[2]!)).toBeNull();
  });

  test("a line says which bonus, who sent it and on which lane, in a polite live region", () => {
    const line = news(html(createElement(RaceTrack, { lanes: LANES, bonuses: [announcement({})] })))!;
    expect(line[0]).toContain('role="status"');
    expect(line[1]).toContain("Saumon_7");
    expect(line[1]).toContain("Maki_Test");
    expect(line[1]).toContain("3 mots de plus");
  });

  test("each kind has its own words: -3 words and fog", () => {
    const fewer = html(createElement(RaceTrack, { lanes: LANES, bonuses: [announcement({ kind: "fewer_words", lane: 2, target: "Saumon_7" })] }));
    expect(badge(rows(fewer)[2]!)?.[1]).toBe("−3 mots");
    expect(news(fewer)![1]).toContain("3 mots en moins");
    const fog = html(createElement(RaceTrack, { lanes: LANES, bonuses: [announcement({ kind: "fog", count: 5 })] }));
    expect(badge(rows(fog)[1]!)?.[1]).toBe("Brouillard");
    expect(news(fog)![1]).toContain("brouillard");
  });

  test("one word only is said in the singular", () => {
    const one = html(createElement(RaceTrack, { lanes: LANES, bonuses: [announcement({ kind: "fewer_words", count: 1, lane: 2 })] }));
    expect(badge(rows(one)[2]!)?.[1]).toBe("−1 mot");
  });

  test("the latest bonus on a lane is the one shown, and the line tells the latest", () => {
    const markup = html(createElement(RaceTrack, { lanes: LANES, bonuses: [announcement({}), announcement({ key: "2:u:40", kind: "fog", count: 5 })] }));
    expect(badge(rows(markup)[1]!)?.[1]).toBe("Brouillard");
    expect(news(markup)![1]).toContain("brouillard");
  });

  test("two bonuses on the same lane at the same checkpoint: both badges stay visible, and the line tells both", () => {
    const markup = html(createElement(RaceTrack, { lanes: LANES, bonuses: [announcement({ key: "1:u:40" }), announcement({ key: "1:u:0", kind: "fog", count: 5, sender: "Corail_418", from: 0 })] }));
    const badges = rows(markup)[1]!.match(/<b [^>]*data-part="bonus"[^>]*>[\s\S]*?<\/b>/g) ?? [];
    expect(badges).toHaveLength(2);
    expect(badges[0]).toContain("+3 mots");
    expect(badges[1]).toContain("Brouillard");
    expect(news(markup)![1]).toContain("3 mots de plus");
    expect(news(markup)![1]).toContain("brouillard");
  });

  test("the badge does not cover the lane's name: it sits in the stats line, in the flow", () => {
    const row = rows(html(createElement(RaceTrack, { lanes: LANES, bonuses: [announcement({})] })))[1]!;
    const stats = row.match(/<p [^>]*data-part="stats"[^>]*>[\s\S]*?<\/p>/)![0];
    expect(stats).toContain('data-part="bonus"');
    expect(stats.match(/<b [^>]*data-part="bonus"[^>]*>/)![0]).not.toMatch(/\babsolute\b/);
  });

  test("without a bonus: no badge, the live region is there and empty", () => {
    const markup = html(createElement(RaceTrack, { lanes: LANES }));
    rows(markup).forEach((row) => expect(badge(row)).toBeNull());
    expect(news(markup)![1]).toBe("");
  });

  test("an unknown sender is still announced, without a name", () => {
    expect(news(html(createElement(RaceTrack, { lanes: LANES, bonuses: [announcement({ sender: null, from: -1 })] })))![1]).toContain("Un joueur");
  });

  test("the badge appears with an animation that stops when motion is reduced", () => {
    const b = rows(html(createElement(RaceTrack, { lanes: LANES, bonuses: [announcement({})] })))[1]!.match(/<b [^>]*data-part="bonus"[^>]*>/)![0];
    expect(b).toContain("animate-");
    expect(b).toContain("motion-reduce:animate-none");
  });

  test("in English", () => {
    const markup = html(createElement(RaceTrack, { lanes: LANES, bonuses: [announcement({})] }), "en");
    expect(badge(rows(markup)[1]!)?.[1]).toBe("+3 words");
    expect(news(markup)![1]).toContain("3 more words for Maki_Test");
  });
});

describe("BONUS-03 — the targeted player is told what happens to them", () => {
  const notice = (markup: string) => markup.match(/<div [^>]*data-part="bonus-notice"[^>]*>([\s\S]*?)<\/div>$/);

  test("+3 words on me: I am told who adds words to my text", () => {
    const markup = html(createElement(BonusNotice, { announcements: [announcement({ mine: true, target: "Corail_418", lane: 0 })] }));
    expect(markup).toContain('role="status"');
    expect(notice(markup)![1]).toContain("+3 mots");
    expect(notice(markup)![1]).toContain("Saumon_7 ajoute 3 mots à la fin de ton texte");
  });

  test("-3 words for me: my last words disappear", () => {
    const markup = html(createElement(BonusNotice, { announcements: [announcement({ kind: "fewer_words", mine: true, sender: "Corail_418" })] }));
    expect(notice(markup)![1]).toContain("les 3 derniers mots de ton texte disparaissent");
  });

  test("fog on me: my next words blur, and for how long", () => {
    const markup = html(createElement(BonusNotice, { announcements: [announcement({ kind: "fog", count: 5, mine: true })] }));
    expect(notice(markup)![1]).toContain("tes prochains mots sont flous pendant 5 s");
  });

  test("a bonus on someone else is not told to me here (the track says it)", () => {
    expect(notice(html(createElement(BonusNotice, { announcements: [announcement({})] })))![1]).toBe("");
  });

  test("two bonuses on me at the same checkpoint: both are told to me, not only the last", () => {
    const markup = html(createElement(BonusNotice, { announcements: [announcement({ mine: true, key: "1:u:40" }), announcement({ kind: "fog", count: 5, mine: true, key: "1:u:12", sender: "Maki_Test" })] }));
    expect(notice(markup)![1]).toContain("Saumon_7 ajoute 3 mots à la fin de ton texte");
    expect(notice(markup)![1]).toContain("tes prochains mots sont flous pendant 5 s");
  });

  test("a bonus from a later checkpoint replaces the earlier one in my notice", () => {
    const markup = html(createElement(BonusNotice, { announcements: [announcement({ mine: true, key: "1:u:40" }), announcement({ kind: "fog", count: 5, mine: true, key: "2:u:40" })] }));
    expect(notice(markup)![1]).not.toContain("ajoute 3 mots");
    expect(notice(markup)![1]).toContain("tes prochains mots sont flous");
  });

  test("the notice animates in, but not when motion is reduced", () => {
    const markup = html(createElement(BonusNotice, { announcements: [announcement({ mine: true })] }));
    expect(markup).toMatch(/<p [^>]*motion-reduce:animate-none/);
  });

  test("in English", () => {
    const markup = html(createElement(BonusNotice, { announcements: [announcement({ kind: "fog", count: 5, mine: true })] }), "en");
    expect(notice(markup)![1]).toContain("your next words are blurred for 5 s");
  });
});
