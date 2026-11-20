// Requêtes simultanées sur un vrai Postgres (voir createServerDatabase) : sans DATABASE_URL, ces tests ne tournent pas.
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
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

setDefaultTimeout(30_000); // SALLE-06 : un compte neuf (mot de passe haché) par salon

describe.skipIf(!process.env.DATABASE_URL)("SALLE-03 / SALLE-06 / SALLE-09 — simultaneous requests on a real Postgres", () => {
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
  let hosts = 0;
  /**
   * SALLE-06 : un compte n'est hôte que d'un salon à la fois ; chaque salon a donc son propre hôte, qui devient
   * `hostCookie` jusqu'au salon suivant.
   */
  const open = async (role: "player" | "spectator" = "player") => {
    const auth = createAuth(server.db);
    const name = `Hote_Course_${++hosts}`;
    await auth.api.signUpEmail({ body: { name, email: placeholderEmail(name), password: "sushi-roll-42", username: name, displayUsername: name } });
    const { headers } = await auth.api.signInUsername({ body: { username: name, password: "sushi-roll-42" }, returnHeaders: true });
    hostCookie = headers.get("set-cookie")!.split(";")[0]!;
    return ((await (await call("POST", "/api/rooms", hostCookie, { role, settings: { visibility: "public", guests: 8 } })).json()) as Joined).room.code;
  };
  const membersOf = (code: string) => server.db.select({ key: roomMembers.memberKey, seat: roomMembers.seat }).from(roomMembers).innerJoin(rooms, eq(rooms.id, roomMembers.roomId)).where(eq(rooms.code, code));

  beforeAll(async () => {
    server = (await createServerDatabase())!;
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
        expect(joined.status).toBe(404); // SALLE-10 : un salon fermé répond comme un code inconnu
      } else {
        expect(joined.status).toBe(200);
        expect(members).toHaveLength(1);
      }
    }
  });

  /** Tient le verrou du salon (comme une requête en cours) pendant que `during` part ; la requête attend sa libération. */
  async function whileLocked(code: string, change: (tx: Parameters<Parameters<Server["db"]["transaction"]>[0]>[0], id: number) => Promise<unknown>, during: () => Promise<Response>) {
    let pending: Promise<Response> | null = null;
    await server.db.transaction(async (tx) => {
      const [room] = await tx.select({ id: rooms.id }).from(rooms).where(eq(rooms.code, code)).for("update");
      await change(tx, room!.id);
      pending = during();
      await Bun.sleep(150);
    });
    return pending!;
  }

  test("SALLE-03 — a join by code validated against a visibility changed meanwhile to private is refused", async () => {
    const code = await open();
    const joined = await whileLocked(code, (tx, id) => tx.update(rooms).set({ visibility: "private" }).where(eq(rooms.id, id)), () => call("POST", "/api/rooms/join", guest("Trop_Tot"), { code }));
    expect(joined.status).toBe(404);
    expect(await membersOf(code)).toHaveLength(1);
  });

  test("SALLE-03 — the host taking a seat while a guest is being seated gets another seat, never a 500", async () => {
    const code = await open("spectator");
    const patched = await whileLocked(
      code,
      (tx, id) => tx.insert(roomMembers).values({ roomId: id, memberKey: "guest:00000000-0000-4000-8000-000000000000", guestName: "En_Cours", role: "player", seat: 0, color: "#000" }),
      () => call("PATCH", `/api/rooms/${code}`, hostCookie, { role: "player" }),
    );
    expect(patched.status).toBe(200);
    const seats = (await membersOf(code)).map((m) => m.seat);
    expect(seats).toHaveLength(2);
    expect(new Set(seats).size).toBe(2);
  });

  test("SALLE-06 — the same person joining two rooms at once ends up in exactly one, the other answer is 409, never a 500", async () => {
    for (let round = 0; round < 10; round++) {
      const a = await open();
      const b = await open();
      const cookie = guest(`Ubiquite_${round}`);
      const answers = await Promise.all([call("POST", "/api/rooms/join", cookie, { code: a }), call("POST", "/api/rooms/join", cookie, { code: b })]);
      expect(answers.map((res) => res.status).sort()).toEqual([200, 409]);
      const refused = (await answers.find((res) => res.status === 409)!.json()) as { error: string; room: string };
      expect(refused.error).toBe("already_in_room");
      const inA = (await membersOf(a)).length - 1;
      const inB = (await membersOf(b)).length - 1;
      expect(inA + inB).toBe(1);
      expect(refused.room).toBe(inA ? a : b);
    }
  });

  test("JOIN-03 — simultaneous quick races never overfill the chosen room: one gets the last seat, the others are told none is left", async () => {
    for (let round = 0; round < 5; round++) {
      await server.db.update(rooms).set({ status: "closed" }); // seul compte le salon de ce tour
      const code = await open();
      await server.db.update(rooms).set({ guests: 2 }).where(eq(rooms.code, code)); // l'hôte et une place libre
      const answers = await Promise.all(["A", "B", "C", "D"].map((letter) => call("POST", "/api/rooms/quick", guest(`Rapide_${round}${letter}`), {})));
      expect(answers.map((res) => res.status).sort()).toEqual([200, 404, 404, 404]);
      expect(await membersOf(code)).toHaveLength(2);
    }
  });
});
