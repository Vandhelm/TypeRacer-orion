import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { arrivalRequest, roomApi } from "./api";

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

  test("a reply without serverNow (an older server) gives no offset", async () => {
    globalThis.fetch = (async () => Response.json({ room: { code: "ABC234" }, you: "player:1" })) as unknown as typeof fetch;
    const reply = await roomApi.read("ABC234");
    expect(reply.ok && reply.offset).toBeUndefined();
  });
});
