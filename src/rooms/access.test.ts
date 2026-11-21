import { describe, expect, spyOn, test } from "bun:test";
import { allows, canJoin, cleanRoomCode, CODE_ALPHABET, isListed, inviteDetour, inviteReturn, isInviteToken, isRoomCode, joinByCodeHref, newInviteToken, newRoomCode } from "./access";

describe("room code", () => {
  test("has no ambiguous characters", () => {
    for (const c of "0O1IL") expect(CODE_ALPHABET).not.toContain(c);
  });

  test("generates valid codes", () => {
    for (let i = 0; i < 200; i++) expect(isRoomCode(newRoomCode())).toBe(true);
  });

  test("rejects wrong length or ambiguous characters", () => {
    expect(isRoomCode("ABC23")).toBe(false);
    expect(isRoomCode("ABC2345")).toBe(false);
    expect(isRoomCode("ABCD0E")).toBe(false);
    expect(isRoomCode("abcdef")).toBe(false);
  });

  test("cleans user input", () => {
    expect(cleanRoomCode("ab-c 2x9qz")).toBe("ABC2X9");
    expect(cleanRoomCode("O1IL")).toBe("");
  });

  test("invite tokens are long and distinct", () => {
    const a = newInviteToken();
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(a).not.toBe(newInviteToken());
  });
});

describe("visibility", () => {
  test("only public rooms are listed", () => {
    expect(isListed("public")).toBe(true);
    expect(isListed("semi")).toBe(false);
    expect(isListed("private")).toBe(false);
  });

  test("code works for public and semi, not private", () => {
    expect(allows("public", "code")).toBe(true);
    expect(allows("semi", "code")).toBe(true);
    expect(allows("private", "code")).toBe(false);
  });

  test("invite link works everywhere", () => {
    expect(allows("public", "invite")).toBe(true);
    expect(allows("semi", "invite")).toBe(true);
    expect(allows("private", "invite")).toBe(true);
  });
});

describe("SALLE-02 — room code drawn by crypto", () => {
  test("the default draw uses crypto.getRandomValues, not Math.random", () => {
    const cryptoSpy = spyOn(crypto, "getRandomValues");
    const mathSpy = spyOn(Math, "random");
    try {
      expect(isRoomCode(newRoomCode())).toBe(true);
      expect(cryptoSpy).toHaveBeenCalled();
      expect(mathSpy).not.toHaveBeenCalled();
    } finally {
      cryptoSpy.mockRestore();
      mathSpy.mockRestore();
    }
  });

  test("bytes that would bias the alphabet are skipped", () => {
    // 248 = 8 × 31 : un octet ≥ 248 favoriserait les premières lettres, il est rejeté
    const bytes = [255, 248, 0, 1, 2, 3, 4, 30];
    let i = 0;
    const source = (n: number) => Uint8Array.from({ length: n }, () => bytes[i++ % bytes.length]!);
    expect(newRoomCode(source)).toBe("ABCDE9");
  });

  test("every character of the alphabet can be drawn", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) for (const c of newRoomCode()) seen.add(c);
    expect(seen.size).toBe(CODE_ALPHABET.length);
  });
});

describe("SALLE-09 — joinable states", () => {
  test("waiting and results are open; racing and closed are not", () => {
    expect(canJoin("waiting")).toBe(true);
    expect(canJoin("results")).toBe(true);
    expect(canJoin("racing")).toBe(false);
    expect(canJoin("closed")).toBe(false);
  });
});

describe("SALLE-04 — a visitor without a session keeps their invite link while choosing a nickname", () => {
  const token = "A".repeat(42) + "_";
  const q = (init: Record<string, string>) => new URLSearchParams(init);

  test("the room page sends them home with the token, and home sends them back to the room", () => {
    expect(inviteDetour(q({ invite: token }))).toBe(`/?invite=${token}`);
    expect(inviteReturn(q({ invite: token }))).toBe(`/room?invite=${token}`);
  });

  test("without a well-formed token: plain home, and no return", () => {
    for (const bad of [{} as Record<string, string>, { invite: "" }, { invite: "short" }, { invite: `${token}x` }, { invite: "A".repeat(42) + "/" }]) {
      expect(inviteDetour(q(bad))).toBe("/");
      expect(inviteReturn(q(bad))).toBeNull();
    }
  });

  test("a real token is well formed", () => {
    expect(isInviteToken(newInviteToken())).toBe(true);
  });
});

describe("JOIN-01 — the home code field leads to the room, or says the code is malformed", () => {
  test("a well-formed code leads to /room?code=<code>", () => {
    expect(joinByCodeHref("K7Q2M9")).toBe("/room?code=K7Q2M9");
  });

  test("the typed code is cleaned first: lowercase, spaces and dashes", () => {
    expect(joinByCodeHref(" k7q-2m9 ")).toBe("/room?code=K7Q2M9");
  });

  test("an empty or too short code leads nowhere", () => {
    expect(joinByCodeHref("")).toBeNull();
    expect(joinByCodeHref("K7Q2M")).toBeNull();
  });

  test("ambiguous or foreign characters do not make a code", () => {
    expect(joinByCodeHref("O1IL00")).toBeNull();
    expect(joinByCodeHref("<script>")).toBeNull();
  });

  test("a code too long is not silently cut into another room's code", () => {
    expect(joinByCodeHref("K7Q2M9X")).toBeNull();
  });
});
