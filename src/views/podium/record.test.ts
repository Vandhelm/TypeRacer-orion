// RES-04 : le podium sait si la course jouée dans l'onglet a battu un record : la réponse du serveur pour un compte,
// l'historique de la session pour un invité.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { rememberGuestRace } from "../profile/stats";
import { podiumRecord, readRecord } from "./record";
import { submitRace, type PlayerResult, type RaceSummary } from "./results";

const store = new Map<string, string>();
const realStorage = globalThis.sessionStorage;
const realFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.sessionStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  } as Storage;
});
afterAll(() => {
  globalThis.sessionStorage = realStorage;
});
beforeEach(() => store.clear());
afterEach(() => {
  globalThis.fetch = realFetch;
});

const me = (extra: Partial<PlayerResult> = {}): PlayerResult => ({
  name: "Moi", rank: 1, me: true, bot: false, wpm: 70, raw: 72, accuracy: 96, seconds: 10, chars: [1, 0, 0, 0], consistency: 0, idle: 0,
  finished: true, eliminated: false, wpmSeries: [], rawSeries: [], errorSeries: [], keys: {}, ...extra,
});
const results = { players: [me()], summary: {} as RaceSummary };
const answer = (status: number, body: unknown) => {
  globalThis.fetch = (async () => Response.json(body, { status })) as unknown as typeof fetch;
};
const race = (wpm: number, accuracy: number) => ({ at: "2026-11-20T10:00:00Z", wpm, accuracy, rank: 1 });

describe("RES-04 — an account's record comes from the server's answer", () => {
  test("a beaten record answered by the server is kept for the podium", async () => {
    answer(201, { raceId: 4, record: { wpm: { previous: 60, current: 70 } } });
    expect(await submitRace(results, "le riz")).toBe("saved");
    expect(readRecord()).toEqual({ wpm: { previous: 60, current: 70 } });
  });

  test("record null (first race, nothing beaten): no indicator, even if the session history says otherwise", async () => {
    rememberGuestRace(race(40, 90));
    rememberGuestRace(race(70, 96));
    answer(201, { raceId: 5, record: null });
    await submitRace(results, "le riz");
    expect(readRecord()).toBeNull();
  });

  test("a refused race shows no record, and clears the one of the previous race", async () => {
    answer(201, { raceId: 6, record: { wpm: { previous: 60, current: 70 } } });
    await submitRace(results, "le riz");
    answer(409, { error: "duplicate_race" });
    expect(await submitRace(results, "le riz")).toBe("failed");
    expect(readRecord()).toBeNull();
  });

  test("a malformed record in the answer is ignored", async () => {
    answer(201, { raceId: 7, record: { wpm: { previous: "60", current: 70 } } });
    await submitRace(results, "le riz");
    expect(readRecord()).toBeNull();
  });
});

describe("RES-04 — a guest's record comes from its session history", () => {
  test("its first race of the session is not a record", async () => {
    rememberGuestRace(race(70, 96));
    answer(200, { raceId: null });
    await submitRace(results, "le riz");
    expect(readRecord()).toBeNull();
  });

  test("a faster race than the earlier ones of the session is a record", async () => {
    rememberGuestRace(race(40, 97));
    rememberGuestRace(race(55, 90));
    rememberGuestRace(race(70, 96));
    answer(200, { raceId: null });
    await submitRace(results, "le riz");
    expect(readRecord()).toEqual({ wpm: { previous: 55, current: 70 } });
  });

  test("without the server's answer, no record is shown", async () => {
    rememberGuestRace(race(40, 97));
    rememberGuestRace(race(70, 98));
    globalThis.fetch = (async () => {
      throw new TypeError("offline");
    }) as unknown as typeof fetch;
    await submitRace(results, "le riz");
    expect(readRecord()).toBeNull();
  });
});

describe("RES-04 — which record the podium shows", () => {
  const record = { wpm: { previous: 60, current: 70 } };
  test("the record of the race played in this tab, for my own result", () => {
    expect(podiumRecord(record, [me()], null)).toEqual(record);
  });
  test("none for a race of the history, a spectator, or an abandon", () => {
    expect(podiumRecord(record, [me()], 12)).toBeNull();
    expect(podiumRecord(record, [me({ me: false })], null)).toBeNull();
    expect(podiumRecord(record, [me({ abandoned: true })], null)).toBeNull();
  });
  test("none if the record does not match my result (left over from another race)", () => {
    expect(podiumRecord({ wpm: { previous: 60, current: 80 } }, [me()], null)).toBeNull();
  });
});
