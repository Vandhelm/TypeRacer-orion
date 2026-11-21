import { afterEach, describe, expect, test } from "bun:test";
import { startGuestSession } from "../../players/nickname";
import { openExplorer } from "./explorer-entry";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Remplace fetch : chaque appel répond 200 et son adresse est gardée. */
function recordFetch(): string[] {
  const urls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    urls.push(String(url));
    return Response.json({ nickname: "Flaneur_1" });
  }) as unknown as typeof fetch;
  return urls;
}

describe("JOIN-02 / JOIN-03 — the explorer button opens the guest session without seating anyone", () => {
  test("a fresh guest gets a session, then the explorer opens; no room is asked for", async () => {
    const urls = recordFetch();
    let opened = 0;
    expect(await openExplorer(() => startGuestSession("Flaneur_1"), () => opened++)).toBe(true);
    expect(urls).toEqual(["/api/guest"]);
    expect(opened).toBe(1);
  });

  test("without a valid nickname the explorer does not open and nothing is sent", async () => {
    const urls = recordFetch();
    let opened = 0;
    expect(await openExplorer(() => startGuestSession("a"), () => opened++)).toBe(false);
    expect(urls).toEqual([]);
    expect(opened).toBe(0);
  });
});
