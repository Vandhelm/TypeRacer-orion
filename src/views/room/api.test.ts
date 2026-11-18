import { describe, expect, test } from "bun:test";
import { arrivalRequest } from "./api";

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
