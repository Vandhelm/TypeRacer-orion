import { describe, expect, test } from "bun:test";
import { createPublicRoom, quickRace, quickRaceOutcome } from "./quick-race";

type Call = { url: string; init?: RequestInit };
/** Un fetch qui répond toujours `status` et `body`, et garde les appels. */
function fakeFetch(status: number, body: unknown, calls: Call[] = []) {
  return (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Response.json(body, { status });
  }) as unknown as typeof fetch;
}

describe("JOIN-03 — what the home page does with the quick race answer", () => {
  test("a joined room opens its waiting room", () => {
    expect(quickRaceOutcome(200, { room: { code: "K7Q2M9" }, you: "guest:x" })).toEqual({ kind: "go", href: "/room?code=K7Q2M9" });
  });

  test("someone already in a room goes back to it", () => {
    expect(quickRaceOutcome(409, { error: "already_in_room", room: "K7Q2M9" })).toEqual({ kind: "go", href: "/room?code=K7Q2M9" });
  });

  test("no room for an account: empty, with the offer to create one", () => {
    expect(quickRaceOutcome(404, { error: "no_room", canCreate: true })).toEqual({ kind: "empty", canCreate: true });
  });

  test("no room for a guest: empty, without the offer", () => {
    expect(quickRaceOutcome(404, { error: "no_room", canCreate: false })).toEqual({ kind: "empty", canCreate: false });
  });

  test("an offer is never assumed when the server does not grant it", () => {
    expect(quickRaceOutcome(404, { error: "no_room" })).toEqual({ kind: "empty", canCreate: false });
    expect(quickRaceOutcome(404, { error: "no_room", canCreate: "yes" })).toEqual({ kind: "empty", canCreate: false });
  });

  test("any other answer is an error shown to the player", () => {
    expect(quickRaceOutcome(401, { error: "unauthorized" })).toEqual({ kind: "error" });
    expect(quickRaceOutcome(500, null)).toEqual({ kind: "error" });
    expect(quickRaceOutcome(200, { room: { code: "<script>" } })).toEqual({ kind: "error" });
  });

  test("quickRace posts an empty object to /api/rooms/quick", async () => {
    const calls: Call[] = [];
    await quickRace(fakeFetch(404, { error: "no_room", canCreate: false }, calls));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("/api/rooms/quick");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.init?.body).toBe("{}");
  });

  test("quickRace gives an error when the server cannot be reached", async () => {
    const offline = (async () => {
      throw new TypeError("offline");
    }) as unknown as typeof fetch;
    expect(await quickRace(offline)).toEqual({ kind: "error" });
  });

  test("createPublicRoom asks for a public room with the default settings, as a player", async () => {
    const calls: Call[] = [];
    expect(await createPublicRoom(fakeFetch(201, { room: { code: "ABCDEF" }, you: "player:1" }, calls))).toEqual({ kind: "go", href: "/room?code=ABCDEF" });
    expect(calls[0]!.url).toBe("/api/rooms");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ role: "player", settings: { visibility: "public" } });
  });

  test("createPublicRoom refused by the server is an error", async () => {
    expect(await createPublicRoom(fakeFetch(403, { error: "account_required" }))).toEqual({ kind: "error" });
  });
});
