// SALLE-10 : la socket d'un salon ne sert pas d'oracle. Les routes HTTP sont couvertes dans rooms.test.ts
// (« no room route tells a closed or foreign room from an unknown code ») ; ici, l'ouverture de la socket.
import { beforeAll, describe, expect, test } from "bun:test";
import type { Server } from "bun";
import { eq } from "drizzle-orm";
import { rooms } from "../../db/schema";
import { createMockDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { createAuth } from "./auth";
import { GUEST_COOKIE, signGuest } from "./guest";
import { createRealtime, type SocketData } from "./realtime";
import { roomEvents } from "./room-events";
import { handleRoomsApi } from "./rooms-api";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
const SECRET = "guest-secret-guest-secret-guest-secret";

describe("SALLE-10 — the room socket tells neither a foreign nor a closed room from an unknown code", () => {
  let realtime: ReturnType<typeof createRealtime>;
  let call: (method: string, path: string, cookie: string, body?: unknown) => Promise<Response>;
  let hostCookie: string;
  let unknown = "ZZZZZZ";
  // un refus est rendu avant tout upgrade : le serveur n'est jamais appelé
  const noServer = {} as Server<SocketData>;
  const stranger = `${GUEST_COOKIE}=${signGuest("Fouineur_Socket", SECRET)}`;

  beforeAll(async () => {
    const db = await createMockDatabase();
    const auth = createAuth(db);
    realtime = createRealtime({ db, auth, secret: SECRET, events: roomEvents });
    call = (method, path, cookie, body) =>
      handleRoomsApi(new Request(`http://localhost${path}`, { method, headers: { cookie, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }), db, auth, SECRET);
    await auth.api.signUpEmail({ body: { name: "Hote_Socket", email: placeholderEmail("Hote_Socket"), password: "sushi-roll-42", username: "Hote_Socket", displayUsername: "Hote_Socket" } });
    const { headers } = await auth.api.signInUsername({ body: { username: "Hote_Socket", password: "sushi-roll-42" }, returnHeaders: true });
    hostCookie = headers.get("set-cookie")!.split(";")[0]!;
    while ((await db.$count(rooms, eq(rooms.code, unknown))) > 0) unknown = unknown.replace("Z", "Y");
  }, 20_000);

  const answer = async (code: string, cookie: string) => {
    const res = await realtime.upgrade(new Request(`http://localhost/ws/rooms/${code}`, { headers: { cookie } }), noServer);
    return { status: res?.status, body: await res?.text() };
  };
  const open = async (visibility: "public" | "private") =>
    ((await (await call("POST", "/api/rooms", hostCookie, { role: "player", settings: { visibility } })).json()) as { room: { code: string } }).room.code;

  test("a non-member gets the same answer for an open room and for an unknown code", async () => {
    const never = await answer(unknown, stranger);
    expect(never.status).toBeGreaterThanOrEqual(400);
    for (const visibility of ["public", "private"] as const) expect(await answer(await open(visibility), stranger)).toEqual(never);
  });

  test("a closed room answers like an unknown code, even to its former host", async () => {
    const code = await open("public");
    await call("POST", `/api/rooms/${code}/leave`, hostCookie);
    const never = await answer(unknown, stranger);
    expect(await answer(code, stranger)).toEqual(never);
    expect(await answer(code, hostCookie)).toEqual(await answer(unknown, hostCookie));
  });
});
