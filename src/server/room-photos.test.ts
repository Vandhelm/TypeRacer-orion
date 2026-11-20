import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { rooms, user } from "../../db/schema";
import { createMockDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { STORED_AVATAR_PREFIX } from "../players/avatar";
import { createAuth } from "./auth";
import { GUEST_COOKIE, signGuest } from "./guest";
import { handleRoomsApi } from "./rooms-api";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
const SECRET = "guest-secret-guest-secret-guest-secret";
const PHOTO = `${STORED_AVATAR_PREFIX}UklGRg==`;

async function setup() {
  const db = await createMockDatabase();
  const auth = createAuth(db);
  const signUp = async (name: string) => {
    await auth.api.signUpEmail({ body: { name, email: placeholderEmail(name), password: "sushi-roll-42", username: name, displayUsername: name } });
    const { headers } = await auth.api.signInUsername({ body: { username: name, password: "sushi-roll-42" }, returnHeaders: true });
    return headers.get("set-cookie")!.split(";")[0]!;
  };
  const call = (path: string, cookie: string, body: unknown) =>
    handleRoomsApi(
      new Request(`http://localhost${path}`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body) }),
      db,
      auth,
      SECRET,
    );
  return { db, signUp, call };
}

type Members = { room: { code: string; members: { name: string; image?: string | null }[] } };

describe("COURSE-05 — the room view carries each account's photo for the track", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  beforeAll(async () => {
    t = await setup();
  });

  test("an account with a stored photo has it; a guest and an account without photo have null", async () => {
    const host = await t.signUp("Photo_Hote");
    await t.db.update(user).set({ image: PHOTO }).where(eq(user.displayUsername, "Photo_Hote"));
    const { room } = (await (await t.call("/api/rooms", host, { role: "player" })).json()) as Members;
    await t.db.update(rooms).set({ visibility: "public" }).where(eq(rooms.code, room.code));
    await t.call("/api/rooms/join", await t.signUp("Sans_Photo"), { code: room.code });
    const joined = (await (await t.call("/api/rooms/join", `${GUEST_COOKIE}=${signGuest("Corail_418", SECRET)}`, { code: room.code })).json()) as Members;
    const byName = Object.fromEntries(joined.room.members.map((m) => [m.name, m.image]));
    expect(byName).toEqual({ Photo_Hote: PHOTO, Sans_Photo: null, Corail_418: null });
  });

  test("a photo that was not resized by the server is never sent", async () => {
    const host = await t.signUp("Photo_Brute");
    await t.db.update(user).set({ image: "https://example.com/tracker.png" }).where(eq(user.displayUsername, "Photo_Brute"));
    const { room } = (await (await t.call("/api/rooms", host, { role: "player" })).json()) as Members;
    expect(room.members[0]!.image).toBeNull();
  });
});
