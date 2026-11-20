import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { READY_MS } from "../../rooms/race-clock";
import { arrivalRequest, roomApi, serverClockOffset, WAITING_POLL_MS, watchRoom } from "./api";

describe("SALLE-06 — the arrival request is sent once, even if the page effect runs twice (React StrictMode)", () => {
  test("two runs of the same arrival share one request: the host's room is created once, never refused as « already in a room »", async () => {
    const holder = { current: null };
    let sent = 0;
    const make = () => {
      sent++;
      return Promise.resolve(sent);
    };
    const first = arrivalRequest(holder, "create|0", make);
    const second = arrivalRequest(holder, "create|0", make);
    expect(second).toBe(first);
    expect(sent).toBe(1);
    expect(await second).toBe(1);
  });

  test("a new attempt (after leaving the current room, or as a spectator) sends a new request", () => {
    const holder = { current: null };
    let sent = 0;
    const make = () => Promise.resolve(++sent);
    arrivalRequest(holder, "create|0", make);
    arrivalRequest(holder, "create|1", make);
    expect(sent).toBe(2);
  });
});

describe("COURSE-03 — each room read measures the clock offset with the server", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("offset = serverNow − the middle of the request, in the browser clock", async () => {
    const clock = spyOn(Date, "now");
    clock.mockReturnValueOnce(10_000).mockReturnValueOnce(10_200);
    globalThis.fetch = (async () => Response.json({ room: { code: "ABC234", serverNow: 15_100 }, you: "player:1" })) as unknown as typeof fetch;
    const reply = await roomApi.read("ABC234");
    clock.mockRestore();
    expect(reply.ok && reply.offset).toBe(5_000);
  });

  const reply = async (sentAt: number, receivedAt: number, serverNow: number) => {
    const clock = spyOn(Date, "now");
    clock.mockReturnValueOnce(sentAt).mockReturnValueOnce(receivedAt);
    globalThis.fetch = (async () => Response.json({ room: { code: "ABC234", serverNow }, you: "player:1" })) as unknown as typeof fetch;
    const answer = await roomApi.read("ABC234");
    clock.mockRestore();
    return answer.ok ? answer.offset : undefined;
  };

  test("a slow reply after it keeps the offset of the fastest one; a faster reply replaces it", async () => {
    const now = Date.now();
    expect(await reply(now, now + 200, now + 100 + 5_000)).toBe(5_000);
    expect(await reply(now + 1_000, now + 3_000, now + 1_100 + 5_000)).toBe(5_000); // lue tôt, revenue 2 s après
    expect(await reply(now + 4_000, now + 4_030, now + 4_015 + 5_020)).toBe(5_020);
    expect(serverClockOffset()).toBe(5_020);
  });

  test("the polling reads of watchRoom (no realtime) update the offset too", async () => {
    const browser = globalThis as unknown as { window?: unknown };
    const hadWindow = "window" in browser;
    browser.window ??= globalThis;
    let polled = 0;
    globalThis.fetch = (async (url: string) => {
      if (String(url).includes("/realtime/ticket")) return new Response(null, { status: 401 }); // pas de temps réel
      polled++;
      // un aller-retour quasi nul (Date.now réel) : la meilleure mesure, décalage 7 s
      return Response.json({ room: { code: "ABC234", serverNow: Date.now() + 7_000 }, you: "player:1" });
    }) as unknown as typeof fetch;
    const stop = watchRoom("ABC234", () => {}, () => {});
    await new Promise((resolve) => setTimeout(resolve, 3_200));
    stop();
    if (!hadWindow) delete browser.window;
    expect(polled).toBeGreaterThanOrEqual(1);
    expect(Math.abs(serverClockOffset() - 7_000)).toBeLessThan(20);
  }, 10_000);

  test("the waiting room without realtime polls fast enough for a guest to see the « 3 »", async () => {
    // budget : le lancement est appris au pire un sondage après, puis /game se charge (≈ 1,7 s mesurées en production)
    const PAGE_LOAD_MS = 2_000;
    expect(WAITING_POLL_MS + PAGE_LOAD_MS).toBeLessThanOrEqual(READY_MS);
    const browser = globalThis as unknown as { window?: unknown };
    const hadWindow = "window" in browser;
    browser.window ??= globalThis;
    let polled = 0;
    globalThis.fetch = (async (url: string) => {
      if (String(url).includes("/realtime/ticket")) return new Response(null, { status: 401 });
      polled++;
      return Response.json({ room: { code: "ABC234" }, you: "player:1" });
    }) as unknown as typeof fetch;
    const stop = watchRoom("ABC234", () => {}, () => {}, WAITING_POLL_MS);
    await new Promise((resolve) => setTimeout(resolve, WAITING_POLL_MS * 2 + 200));
    stop();
    if (!hadWindow) delete browser.window;
    expect(polled).toBeGreaterThanOrEqual(2);
  }, 10_000);

  test("a reply without serverNow (an older server), or with a non-number one, gives no offset", async () => {
    for (const room of [{ code: "ABC234" }, { code: "ABC234", serverNow: "15100" }, { code: "ABC234", serverNow: null }]) {
      globalThis.fetch = (async () => Response.json({ room, you: "player:1" })) as unknown as typeof fetch;
      const reply = await roomApi.read("ABC234");
      expect(reply.ok && reply.offset).toBeUndefined();
    }
  });
});
