// Outils des tests de salons : une base de démo, son auth, des sessions de compte ou d'invité, et un appel aux routes.
import { eq } from "drizzle-orm";
import { user } from "../../db/schema";
import { createMockDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { createAuth } from "./auth";
import { GUEST_COOKIE, signGuest } from "./guest";
import { handleRoomsApi, type RoomChanged } from "./rooms-api";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
export const SECRET = "guest-secret-guest-secret-guest-secret";

export type RoomJson = {
  code: string;
  status: string;
  host: string;
  settings: { guests: number };
  members: { key: string; name: string; role: string; seat: number | null; color: string | null; host: boolean; guest: boolean }[];
  invite: string | null;
};
export type Joined = { room: RoomJson; you: string };
export type Refused = { error: string; room?: string };

export async function roomsFixture(changed?: RoomChanged) {
  const db = await createMockDatabase();
  const auth = createAuth(db);
  const signUp = async (name: string) => {
    await auth.api.signUpEmail({ body: { name, email: placeholderEmail(name), password: "sushi-roll-42", username: name, displayUsername: name } });
    const { headers } = await auth.api.signInUsername({ body: { username: name, password: "sushi-roll-42" }, returnHeaders: true });
    const [account] = await db.select({ playerId: user.playerId }).from(user).where(eq(user.displayUsername, name));
    return { cookie: headers.get("set-cookie")!.split(";")[0]!, playerId: account!.playerId };
  };
  /** Un invité neuf à chaque appel : sa propre session signée. */
  const guest = (name: string) => `${GUEST_COOKIE}=${signGuest(name, SECRET)}`;
  const call = (method: string, path: string, cookie?: string, body?: unknown) =>
    handleRoomsApi(
      new Request(`http://localhost${path}`, {
        method,
        headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      db,
      auth,
      SECRET,
      changed,
    );
  /** Un compte neuf crée un salon public ; renvoie le salon et l'hôte (cookie, id, clé). */
  const open = async (name: string, settings: Record<string, unknown> = {}, role: "player" | "spectator" = "player") => {
    const host = await signUp(name);
    const res = await call("POST", "/api/rooms", host.cookie, { role, settings: { visibility: "public", ...settings } });
    if (res.status !== 201) throw new Error(`create failed: ${res.status} ${await res.text()}`);
    const { room, you } = (await res.json()) as Joined;
    return { room, host: { ...host, key: you } };
  };
  /** POST /api/rooms/join : le statut et le corps de la réponse. */
  const join = async (cookie: string, body: Record<string, unknown>) => {
    const res = await call("POST", "/api/rooms/join", cookie, body);
    return { status: res.status, body: (await res.json()) as Joined & Refused };
  };
  /** GET /api/rooms/:code : le statut et le corps de la réponse. */
  const read = async (cookie: string, code: string) => {
    const res = await call("GET", `/api/rooms/${code}`, cookie);
    return { status: res.status, body: (await res.json()) as Joined & Refused };
  };
  return { db, auth, signUp, guest, call, open, join, read };
}
