import { describe, expect, test } from "bun:test";
import type { Player } from "../room/room";
import { clockOffset, countdownAt, createClockSync, GO_MS, nextChangeIn, raceDurationSeconds, READY, SAMPLE_MAX_AGE_MS } from "./countdown";
import { advanceBots, createCourse, createRace, secondsLeft, startRace } from "./race";

const STARTS = 1_000_000;

describe("COURSE-03 — the countdown follows the server start, corrected by the clock offset", () => {
  test("the offset is the server time minus the middle of the request (RTT / 2 correction)", () => {
    // le navigateur envoie à 10 000 et reçoit à 10 200 (heure locale) ; le serveur lisait 15 100
    expect(clockOffset(10_000, 10_200, 15_100)).toBe(5_000);
    expect(clockOffset(10_000, 10_000, 9_000)).toBe(-1_000);
  });

  test("a browser 5 s ahead and one 5 s late show the same digit at the same instant", () => {
    const real = STARTS - 2_500; // même instant réel pour les deux membres
    const ahead = real + 5_000;
    const late = real - 5_000;
    const aheadOffset = clockOffset(ahead - 40, ahead + 40, real);
    const lateOffset = clockOffset(late - 40, late + 40, real);
    expect(countdownAt(STARTS, ahead + aheadOffset)).toEqual({ count: 3, started: false });
    expect(countdownAt(STARTS, late + lateOffset)).toEqual({ count: 3, started: false });
    // et les deux partent au même instant réel : startsAt
    expect(countdownAt(STARTS, STARTS + 5_000 + aheadOffset).started).toBe(true);
    expect(countdownAt(STARTS, STARTS - 5_000 + lateOffset).started).toBe(true);
    expect(countdownAt(STARTS, STARTS - 1 - 5_000 + lateOffset).started).toBe(false);
  });

  test("3, 2, 1 one second each, the start exactly at startsAt, then « go » for GO_MS", () => {
    expect(countdownAt(STARTS, STARTS - 3_000)).toEqual({ count: 3, started: false });
    expect(countdownAt(STARTS, STARTS - 2_001)).toEqual({ count: 3, started: false });
    expect(countdownAt(STARTS, STARTS - 2_000)).toEqual({ count: 2, started: false });
    expect(countdownAt(STARTS, STARTS - 1_000)).toEqual({ count: 1, started: false });
    expect(countdownAt(STARTS, STARTS - 1)).toEqual({ count: 1, started: false });
    expect(countdownAt(STARTS, STARTS)).toEqual({ count: 0, started: true });
    expect(countdownAt(STARTS, STARTS + GO_MS - 1)).toEqual({ count: 0, started: true });
    expect(countdownAt(STARTS, STARTS + GO_MS)).toEqual({ count: null, started: true });
  });

  test("a member who arrives or reloads mid-countdown sees the right digit", () => {
    expect(countdownAt(STARTS, STARTS - 1_500).count).toBe(2);
    expect(countdownAt(STARTS, STARTS - 400).count).toBe(1);
  });

  test("a member who arrives after the start races at once, without countdown", () => {
    expect(countdownAt(STARTS, STARTS + 10_000)).toEqual({ count: null, started: true });
  });

  test("before the 3, the preparation shows « get ready » (READY), however early", () => {
    expect(countdownAt(STARTS, STARTS - 3_001)).toEqual({ count: READY, started: false });
    expect(countdownAt(STARTS, STARTS - 60_000).count).toBe(READY);
  });

  test("the next change is at the next second boundary, then at the end of « go »", () => {
    expect(nextChangeIn(STARTS, STARTS - 2_500)).toBe(500);
    expect(nextChangeIn(STARTS, STARTS - 2_000)).toBe(1_000);
    expect(nextChangeIn(STARTS, STARTS - 10)).toBe(10);
    expect(nextChangeIn(STARTS, STARTS + 100)).toBe(GO_MS - 100);
    expect(nextChangeIn(STARTS, STARTS + GO_MS)).toBeNull();
    expect(nextChangeIn(STARTS, STARTS - 60_000)).toBe(57_000);
  });
});

describe("COURSE-03 — the race timer follows the server end (endsAt)", () => {
  const players: Player[] = [{ name: "Moi", color: "#fff", me: true }];
  const race = (seconds: number | null) => createRace(createCourse(["riz", "nori"], seconds, "fix"), players, "medium", "high", () => 0.5);

  test("the race lasts endsAt − startsAt, whatever the local setting", () => {
    expect(raceDurationSeconds(STARTS, STARTS + 45_000, 60)).toBe(45);
    expect(raceDurationSeconds(STARTS, null, 60)).toBeNull();
    // sans départ du serveur (pas de salons en base) : la durée du salon
    expect(raceDurationSeconds(null, null, 60)).toBe(60);
  });

  test("started at startsAt, the timer reads endsAt − server now, and the race ends at endsAt", () => {
    const ends = STARTS + 30_000;
    const started = startRace(race(raceDurationSeconds(STARTS, ends, 60)), STARTS);
    const midway = advanceBots(started, ends - 12_300, [0]);
    expect(secondsLeft(midway)).toBe(13);
    expect(advanceBots(started, ends - 1, [0]).phase).toBe("racing");
    expect(advanceBots(started, ends, [0]).phase).toBe("done");
  });
});

describe("COURSE-03 — the clock offset kept is the one of the fastest round trip", () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  };

  test("a slow reply in between does not move the offset; a faster one replaces it", () => {
    const sync = createClockSync(memory());
    expect(sync.offset()).toBe(0);
    expect(sync.add(10_000, 10_100, 15_050)).toBe(5_000); // aller-retour 100 ms
    expect(sync.add(20_000, 22_000, 26_000)).toBe(5_000); // 2 s : réponse lente isolée, écart brut 5 000 ± 1 000
    expect(sync.add(30_000, 30_040, 35_060)).toBe(5_040); // 40 ms : plus sûre
    expect(sync.offset()).toBe(5_040);
  });

  test("two browsers, one of them with a slow isolated reply, stay within 150 ms of each other", () => {
    // l'heure réelle (serveur) d'une heure locale : A a 3 s d'avance, B 2 s de retard
    const realA = (local: number) => local - 3_000;
    const realB = (local: number) => local + 2_000;
    const a = createClockSync(memory());
    const b = createClockSync(memory());
    a.add(1_000, 1_080, realA(1_040)); // le serveur lit son heure au milieu de l'aller-retour
    b.add(1_000, 1_090, realB(1_045));
    b.add(5_000, 7_000, realB(5_100)); // réponse lente isolée : lue tôt, revenue 2 s après (écart brut faux de 900 ms)
    // erreur de chacun sur l'heure du serveur, puis écart entre les deux navigateurs
    const errorA = a.offset() - -3_000;
    const errorB = b.offset() - 2_000;
    expect(Math.abs(errorA - errorB)).toBeLessThan(150);
  });

  test("the best sample survives the page change to /game (session storage), but not forever", () => {
    const storage = memory();
    createClockSync(storage).add(10_000, 10_100, 15_050);
    const next = createClockSync(storage, () => 10_100 + 60_000);
    expect(next.offset()).toBe(5_000);
    expect(createClockSync(storage, () => 10_100 + SAMPLE_MAX_AGE_MS + 1).offset()).toBe(0);
  });

  test("an old fast sample gives way to a fresh slower one", () => {
    const sync = createClockSync(memory());
    sync.add(10_000, 10_020, 15_010);
    expect(sync.add(10_000 + SAMPLE_MAX_AGE_MS + 1, 10_000 + SAMPLE_MAX_AGE_MS + 501, 10_000 + SAMPLE_MAX_AGE_MS + 251 + 4_000)).toBe(4_000);
  });

  test("a broken or foreign stored value is ignored", () => {
    for (const raw of ["{", "null", '{"offset":"x","rtt":1,"at":1}', '{"offset":1e400,"rtt":1,"at":1}']) {
      const storage = memory();
      storage.setItem("orion.clock", raw);
      expect(createClockSync(storage, () => 2).offset()).toBe(0);
    }
  });

  test("without storage (private mode, server), the sync still works in memory", () => {
    const sync = createClockSync(null);
    expect(sync.add(0, 100, 1_050)).toBe(1_000);
  });
});
