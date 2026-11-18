// Requêtes simultanées sur un vrai Postgres (voir createServerDatabase) : sans DATABASE_URL, ces tests ne tournent pas.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { roomMembers, rooms } from "../../db/schema";
import { createServerDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { createAuth } from "./auth";
import { GUEST_COOKIE, signGuest } from "./guest";
import { handleRoomsApi } from "./rooms-api";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
const SECRET = "guest-secret-guest-secret-guest-secret";

type Joined = { room: { code: string; status: string; members: { key: string; seat: number | null }[] }; you: string };
type Server = NonNullable<Awaited<ReturnType<typeof createServerDatabase>>>;

describe.skipIf(!process.env.DATABASE_URL)("SALLE-03 — simultaneous requests on a real Postgres", () => {
  let server: Server;
  let hostCookie: string;
  const call = (method: string, path: string, cookie?: string, body?: unknown) =>
    handleRoomsApi(
      new Request(`http://localhost${path}`, { method, headers: { ...(cookie ? { cookie } : {}), "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }),
      server.db,
      createAuth(server.db),
      SECRET,
    );
  const guest = (name: string) => `${GUEST_COOKIE}=${signGuest(name, SECRET)}`;
  const open = async () => ((await (await call("POST", "/api/rooms", hostCookie, { role: "player", settings: { visibility: "public" } })).json()) as Joined).room.code;
  const membersOf = (code: string) => server.db.select({ key: roomMembers.memberKey, seat: roomMembers.seat }).from(roomMembers).innerJoin(rooms, eq(rooms.id, roomMembers.roomId)).where(eq(rooms.code, code));

  beforeAll(async () => {
    server = (await createServerDatabase())!;
    const auth = createAuth(server.db);
    await auth.api.signUpEmail({ body: { name: "Hote_Course", email: placeholderEmail("Hote_Course"), password: "sushi-roll-42", username: "Hote_Course", displayUsername: "Hote_Course" } });
    const { headers } = await auth.api.signInUsername({ body: { username: "Hote_Course", password: "sushi-roll-42" }, returnHeaders: true });
    hostCookie = headers.get("set-cookie")!.split(";")[0]!;
  });
  afterAll(async () => {
    await server?.drop();
  });

  test("SALLE-03 — simultaneous joins get distinct seats, each member present in its own answer", async () => {
    for (let round = 0; round < 5; round++) {
      const code = await open();
      const names = ["A", "B", "C", "D", "E"].map((letter) => `Rafale_${round}${letter}`);
      const answers = await Promise.all(names.map((name) => call("POST", "/api/rooms/join", guest(name), { code })));
      expect(answers.map((res) => res.status)).toEqual([200, 200, 200, 200, 200]);
      for (const { room, you } of (await Promise.all(answers.map((res) => res.json()))) as Joined[]) expect(room.members.map((m) => m.key)).toContain(you);
      const members = await membersOf(code);
      expect(members).toHaveLength(6);
      expect(new Set(members.map((m) => m.seat)).size).toBe(6);
    }
  });

});
