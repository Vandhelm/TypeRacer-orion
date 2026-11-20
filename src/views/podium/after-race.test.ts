import { describe, expect, test } from "bun:test";
import type { RoomView } from "../../server/rooms";
import type { Answer } from "../room/api";
import { afterRace, ROOM_CLOSED_HREF, takeRoomClosed } from "./after-race";

const view = (status: RoomView["status"], finished: boolean, host = "player:1"): Answer => ({
  ok: true,
  result: {
    you: "player:2",
    room: {
      code: "ABC234", status, host, passage: null, seed: null, startsAt: null, endsAt: null, textHash: null, settings: {} as RoomView["settings"],
      members: [
        { key: "player:1", name: "Hote", guest: false, host: host === "player:1", role: "player", seat: 0, color: null, finished },
        { key: "player:2", name: "Moi", guest: false, host: host === "player:2", role: "player", seat: 1, color: null, finished },
      ],
    },
  },
});

describe("COURSE-11 — after the race, the podium follows its room", () => {
  test("on the results, a non-host waits: host is false, no redirection", () => {
    expect(afterRace(view("results", true), false)).toEqual({ host: false, ended: true, go: null });
  });

  test("the host is told by the server (room.host === you), never guessed", () => {
    expect(afterRace(view("results", true, "player:2"), false).host).toBe(true);
  });

  test("the host relaunched (racing again, not finished, after the end was seen): everyone goes to the race", () => {
    expect(afterRace(view("racing", false), true).go).toBe("/game?code=ABC234");
  });

  test("the first race still running when the podium opens (others typing) does not send back to /game", () => {
    expect(afterRace(view("racing", true), false)).toEqual({ host: false, ended: true, go: null });
    expect(afterRace(view("racing", false), false).go).toBeNull();
  });

  test("the room closed by the host (gone, or the realtime 'closed'): back home with the notice", () => {
    expect(afterRace({ ok: false, error: "not_found" }, true)).toEqual({ host: null, ended: true, go: ROOM_CLOSED_HREF });
    expect(afterRace({ ok: false, error: "closed" }, true).go).toBe(ROOM_CLOSED_HREF);
  });

  test("a network failure changes nothing", () => {
    expect(afterRace({ ok: false, error: "network" }, true)).toEqual({ host: null, ended: true, go: null });
  });
});

describe("COURSE-11 — the home page tells the room was closed", () => {
  test("?roomClosed=1 shows the notice and is removed from the address", () => {
    expect(ROOM_CLOSED_HREF).toBe("/home?roomClosed=1");
    expect(takeRoomClosed("?roomClosed=1")).toEqual({ closed: true, search: "" });
    expect(takeRoomClosed("?roomClosed=1&linked=github")).toEqual({ closed: true, search: "?linked=github" });
  });

  test("without the parameter, nothing is shown", () => {
    expect(takeRoomClosed("")).toEqual({ closed: false, search: "" });
    expect(takeRoomClosed("?linked=github")).toEqual({ closed: false, search: "?linked=github" });
  });
});
