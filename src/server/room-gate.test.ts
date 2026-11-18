import { beforeAll, describe, expect, test } from "bun:test";
import { createMockDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { createAuth } from "./auth";
import { GUEST_COOKIE, signGuest } from "./guest";
import { roomPlayer } from "./room-gate";

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
