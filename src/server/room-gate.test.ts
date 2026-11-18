import { beforeAll, describe, expect, test } from "bun:test";
import { createMockDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { createAuth } from "./auth";
import { GUEST_COOKIE, signGuest } from "./guest";
import { roomEntry, roomPlayer, roomQuery } from "./room-gate";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
const SECRET = "guest-secret-guest-secret-guest-secret";

describe("AUTH-02 — joining a room needs a nickname", () => {
  let auth: ReturnType<typeof createAuth>;
  beforeAll(async () => {
    auth = createAuth(await createMockDatabase());
  });
  const cookie = (value: string) => new Headers({ cookie: value });

  test("a guest without a session cannot join", async () => {
    expect(await roomPlayer(new Headers(), auth, SECRET)).toBeNull();
  });

  test("a guest with a forged cookie cannot join", async () => {
    const forged = signGuest("Corail_418", "another-secret-another-secret-12");
    expect(await roomPlayer(cookie(`${GUEST_COOKIE}=${forged}`), auth, SECRET)).toBeNull();
  });

  test("a guest with a signed nickname joins under that nickname", async () => {
    expect(await roomPlayer(cookie(`${GUEST_COOKIE}=${signGuest("Corail_418", SECRET)}`), auth, SECRET)).toBe("Corail_418");
  });

  test("a signed-in user joins under their username, even with a guest cookie", async () => {
    const name = "Porte_Cle";
    await auth.api.signUpEmail({ body: { name, email: placeholderEmail(name), password: "sushi-roll-42", username: name, displayUsername: name } });
    const { headers } = await auth.api.signInUsername({ body: { username: name, password: "sushi-roll-42" }, returnHeaders: true });
    const session = headers.get("set-cookie")!.split(";")[0]!;
    expect(await roomPlayer(cookie(`${session}; ${GUEST_COOKIE}=${signGuest("Corail_418", SECRET)}`), auth, SECRET)).toBe(name);
  });
});

describe("AUTH-03 — a guest cannot create a room", () => {
  let auth: ReturnType<typeof createAuth>;
  beforeAll(async () => {
    auth = createAuth(await createMockDatabase());
  });
  const guest = new Headers({ cookie: `${GUEST_COOKIE}=${signGuest("Corail_418", SECRET)}` });

  test("a guest cookie alone cannot open /room?new", async () => {
    expect(await roomEntry(guest, auth, new URLSearchParams("new"), SECRET)).toEqual({ refused: "guest" });
  });

  test("a guest cannot open /room without a room to join (host mode)", async () => {
    expect(await roomEntry(guest, auth, new URLSearchParams(""), SECRET)).toEqual({ refused: "guest" });
  });

  test("a guest still joins with a code, an invite or a table", async () => {
    for (const search of ["code=ABC234", "invite=0123456789abcdef0123456789abcdef", "table=2"]) {
      expect(await roomEntry(guest, auth, new URLSearchParams(search), SECRET)).toEqual({ player: "Corail_418", guest: true });
    }
  });

  test("an empty code does not count as joining", async () => {
    expect(await roomEntry(guest, auth, new URLSearchParams("code=&new"), SECRET)).toEqual({ refused: "guest" });
  });

  test("Next.js search params become a query, first value of a repeated key", () => {
    const query = roomQuery({ new: "", code: ["ABC234", "ZZZ222"], invite: undefined });
    expect(query.has("new")).toBe(true);
    expect(query.get("code")).toBe("ABC234");
    expect(query.has("invite")).toBe(false);
  });

  test("a guest cannot sneak creation through malformed params", async () => {
    expect(await roomEntry(guest, auth, roomQuery({ new: "", code: [] }), SECRET)).toEqual({ refused: "guest" });
  });

  test("without any session, the entry asks for a nickname", async () => {
    expect(await roomEntry(new Headers(), auth, new URLSearchParams("new"), SECRET)).toEqual({ refused: "anonymous" });
  });

  test("a signed-in user creates a room", async () => {
    const name = "Banc_Hote";
    await auth.api.signUpEmail({ body: { name, email: placeholderEmail(name), password: "sushi-roll-42", username: name, displayUsername: name } });
    const { headers } = await auth.api.signInUsername({ body: { username: name, password: "sushi-roll-42" }, returnHeaders: true });
    const session = new Headers({ cookie: headers.get("set-cookie")!.split(";")[0]! });
    expect(await roomEntry(session, auth, new URLSearchParams("new"), SECRET)).toEqual({ player: name, guest: false });
  });
});
