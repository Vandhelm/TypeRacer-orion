// Requêtes simultanées sur un vrai Postgres (voir createServerDatabase) : sans DATABASE_URL, ces tests ne tournent pas.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { roomInvites, roomMembers, rooms } from "../../db/schema";
import { createServerDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { createAuth } from "./auth";
import { GUEST_COOKIE, signGuest } from "./guest";
import { MAX_INVITES } from "./room-invites";
import { handleRoomsApi } from "./rooms-api";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
const SECRET = "guest-secret-guest-secret-guest-secret";

type Server = NonNullable<Awaited<ReturnType<typeof createServerDatabase>>>;

describe.skipIf(!process.env.DATABASE_URL)("SALLE-04 — simultaneous use of one invitation link on a real Postgres", () => {
  let server: Server;
  /** SALLE-06 : un compte n'est que dans un salon à la fois ; chaque salon de test a son propre hôte. */
  let signUp: (name: string) => Promise<string>;
  const call = (method: string, path: string, cookie: string, body?: unknown, ip = "203.0.113.1") =>
    handleRoomsApi(
      new Request(`http://localhost${path}`, { method, headers: { cookie, "content-type": "application/json", "x-forwarded-for": ip }, body: body === undefined ? undefined : JSON.stringify(body) }),
      server.db,
      createAuth(server.db),
      SECRET,
      undefined,
      undefined,
      { env: { TRUST_PROXY: "1" } },
    );
  const guest = (name: string) => `${GUEST_COOKIE}=${signGuest(name, SECRET)}`;

  beforeAll(async () => {
    server = (await createServerDatabase())!;
    const auth = createAuth(server.db);
    signUp = async (name) => {
      await auth.api.signUpEmail({ body: { name, email: placeholderEmail(name), password: "sushi-roll-42", username: name, displayUsername: name } });
      const { headers } = await auth.api.signInUsername({ body: { username: name, password: "sushi-roll-42" }, returnHeaders: true });
      return headers.get("set-cookie")!.split(";")[0]!;
    };
  });
  afterAll(async () => {
    await server?.drop();
  });

  test("five people from five IPs open the same link at once: exactly one gets in", async () => {
    for (let round = 0; round < 5; round++) {
      const hostCookie = await signUp(`Hote_Rafale_${round}`);
      const { room } = (await (await call("POST", "/api/rooms", hostCookie, { role: "player" })).json()) as { room: { code: string } };
      const { invite } = (await (await call("POST", `/api/rooms/${room.code}/invites`, hostCookie)).json()) as { invite: { token: string } };
      const answers = await Promise.all(["A", "B", "C", "D", "E"].map((letter, i) => call("POST", "/api/rooms/join", guest(`Rafale_${round}${letter}`), { invite: invite.token }, `198.51.100.${i + 1}`)));
      expect(answers.map((res) => res.status).sort()).toEqual([200, 403, 403, 403, 403]);
      const [row] = await server.db.select({ id: rooms.id }).from(rooms).where(eq(rooms.code, room.code));
      expect(await server.db.$count(roomMembers, eq(roomMembers.roomId, row!.id))).toBe(2);
    }
  });

  test(`simultaneous generations never go past ${MAX_INVITES} links`, async () => {
    const hostCookie = await signUp("Hote_Rafale_Liens");
    const { room } = (await (await call("POST", "/api/rooms", hostCookie, { role: "player" })).json()) as { room: { code: string } };
    const answers = await Promise.all(Array.from({ length: MAX_INVITES + 10 }, () => call("POST", `/api/rooms/${room.code}/invites`, hostCookie)));
    expect(answers.filter((res) => res.status === 201)).toHaveLength(MAX_INVITES);
    const [row] = await server.db.select({ id: rooms.id }).from(rooms).where(eq(rooms.code, room.code));
    expect(await server.db.$count(roomInvites, eq(roomInvites.roomId, row!.id))).toBe(MAX_INVITES);
  });

  /** SEC-01 : un salon avec son hôte H et un compte A ; A reprendra l'hôte au départ de H (SALLE-08). */
  const hostAndHeir = async (name: string) => {
    const hostCookie = await signUp(`Hote_${name}`);
    const heirCookie = await signUp(`Heir_${name}`);
    const { room } = (await (await call("POST", "/api/rooms", hostCookie, { role: "player", settings: { visibility: "public" } })).json()) as { room: { code: string } };
    expect((await call("POST", "/api/rooms/join", heirCookie, { code: room.code })).status).toBe(200);
    const [row] = await server.db.select({ id: rooms.id }).from(rooms).where(eq(rooms.code, room.code));
    return { code: room.code, id: row!.id, hostCookie };
  };

  test("SEC-01 — the host leaves while asking for a link, the leave taking the lock first: the link is refused", async () => {
    const { code, id, hostCookie } = await hostAndHeir("Depart_Lien");
    // une transaction tient le verrou du salon : le départ attend derrière, puis la demande de lien derrière le départ
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const isLocked = new Promise<void>((resolve) => (locked = resolve));
    const holder = server.db.transaction(async (tx) => {
      await tx.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, id)).for("update");
      locked();
      await held;
    });
    await isLocked;
    const leave = call("POST", `/api/rooms/${code}/leave`, hostCookie);
    await Bun.sleep(150);
    const invite = call("POST", `/api/rooms/${code}/invites`, hostCookie);
    await Bun.sleep(150);
    release();
    await holder;
    const [left, asked] = await Promise.all([leave, invite]);
    expect(left.status).toBe(200);
    expect([403, 404]).toContain(asked.status);
    expect(await server.db.$count(roomInvites, eq(roomInvites.roomId, id))).toBe(0);
  });

  test("SEC-01 — POST /invites and POST /leave at once by the host: a link exists only if it was made before the leave", async () => {
    for (let round = 0; round < 10; round++) {
      const { code, id, hostCookie } = await hostAndHeir(`Course_${round}`);
      const [asked, left] = await Promise.all([call("POST", `/api/rooms/${code}/invites`, hostCookie), call("POST", `/api/rooms/${code}/leave`, hostCookie)]);
      expect(left.status).toBe(200);
      expect([201, 403, 404]).toContain(asked.status);
      expect(await server.db.$count(roomInvites, eq(roomInvites.roomId, id))).toBe(asked.status === 201 ? 1 : 0);
      // l'ancien hôte n'est plus membre : il ne crée plus aucun lien
      expect((await call("POST", `/api/rooms/${code}/invites`, hostCookie)).status).toBe(404);
    }
  });
});
