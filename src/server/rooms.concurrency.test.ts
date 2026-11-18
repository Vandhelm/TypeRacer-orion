// Requêtes simultanées sur un vrai Postgres (voir createServerDatabase) : sans DATABASE_URL, ces tests ne tournent pas.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { roomMembers, rooms } from "../../db/schema";
import { createServerDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { createAuth } from "./auth";
import { GUEST_COOKIE, signGuest } from "./guest";
import { leaveAfterDisconnect, leaveRoom, type Identity } from "./rooms";
import { handleRoomsApi } from "./rooms-api";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
const SECRET = "guest-secret-guest-secret-guest-secret";

type Joined = { room: { code: string; status: string; members: { key: string; seat: number | null }[] }; you: string };
type Server = NonNullable<Awaited<ReturnType<typeof createServerDatabase>>>;

describe.skipIf(!process.env.DATABASE_URL)("SALLE-03 / SALLE-09 — simultaneous requests on a real Postgres", () => {
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

  test("SALLE-09 — a join racing the launch never adds a member once the room is racing", async () => {
    for (let round = 0; round < 10; round++) {
      const code = await open();
      const cookie = guest(`Course_${round}`);
      const [joined, launched] = await Promise.all([call("POST", "/api/rooms/join", cookie, { code }), call("POST", `/api/rooms/${code}/launch`, hostCookie)]);
      expect(launched.status).toBe(200);
      const members = await membersOf(code);
      if (joined.status === 200) {
        // entré avant le lancement : il fait partie de la course
        expect(members).toHaveLength(2);
      } else {
        expect(joined.status).toBe(409);
        expect(members).toHaveLength(1);
      }
    }
  });

  const statusOf = async (code: string) => (await server.db.select({ status: rooms.status }).from(rooms).where(eq(rooms.code, code)))[0]!.status;
  const joinAs = async (name: string, code: string) => {
    const cookie = guest(name);
    const { you } = (await (await call("POST", "/api/rooms/join", cookie, { code })).json()) as Joined;
    return { cookie, who: { kind: "guest", name, sessionId: you.slice("guest:".length) } satisfies Identity };
  };

  test("SALLE-09 — a disconnection timing out while the host launches never removes a member from the race", async () => {
    for (let round = 0; round < 10; round++) {
      const code = await open();
      const { who } = await joinAs(`Absent_${round}`, code);
      const [, launched] = await Promise.all([leaveAfterDisconnect(server.db, code, who), call("POST", `/api/rooms/${code}/launch`, hostCookie)]);
      expect(launched.status).toBe(200);
      const { room } = (await launched.json()) as Joined;
      // présent au moment du lancement : il est toujours là
      if (room.members.length === 2) expect(await membersOf(code)).toHaveLength(2);
      expect(await statusOf(code)).toBe("racing");
    }
  });

  test("SALLE-09 — the last member leaving while someone joins never leaves a closed room with members", async () => {
    for (let round = 0; round < 10; round++) {
      const code = await open();
      const [hostMember] = await membersOf(code);
      const hostWho = { kind: "account", playerId: Number(hostMember!.key.slice("player:".length)), name: "Hote_Course" } satisfies Identity;
      const [, joined] = await Promise.all([leaveRoom(server.db, code, hostWho), call("POST", "/api/rooms/join", guest(`Arrivant_${round}`), { code })]);
      const status = await statusOf(code);
      const members = await membersOf(code);
      if (status === "closed") {
        expect(members).toHaveLength(0);
        expect(joined.status).toBe(410);
      } else {
        expect(joined.status).toBe(200);
        expect(members).toHaveLength(1);
      }
    }
  });
});
