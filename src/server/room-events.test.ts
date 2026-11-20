import { expect, test } from "bun:test";
import { roomChanges } from "./room-events";

test("TECH-06 — a failed LISTEN is retried instead of crashing, then changes flow again", async () => {
  let attempts = 0;
  let deliver: (payload: string) => void = () => {};
  const listen = async (_channel: string, onMessage: (payload: string) => void) => {
    attempts++;
    if (attempts === 1) throw new Error("connect ECONNREFUSED");
    deliver = onMessage;
  };
  const seen: string[] = [];
  roomChanges(listen, { retryMs: 5, log: () => {} }).on((code) => seen.push(code));
  await Bun.sleep(30);
  expect(attempts).toBe(2);
  deliver("ABCD23");
  expect(seen).toEqual(["ABCD23"]);
});
