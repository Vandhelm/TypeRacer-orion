import { describe, expect, test } from "bun:test";
import { socialCallbacks } from "./callbacks";

describe("SALLE-04 — signing in with GitHub or Discord keeps the invite link", () => {
  const token = "A".repeat(42) + "_";

  test("from /?invite=T, success goes to the room by the link, and an error comes back home with the link", () => {
    expect(socialCallbacks("github", `?invite=${token}`)).toEqual({
      callbackURL: `/room?invite=${token}`,
      errorCallbackURL: `/?authError=github&invite=${token}`,
    });
  });

  test("without an invite (or a malformed one), the usual home callbacks", () => {
    for (const search of ["", "?invite=short", "?code=ABCDEF"]) {
      expect(socialCallbacks("discord", search)).toEqual({ callbackURL: "/", errorCallbackURL: "/?authError=discord" });
    }
  });
});
