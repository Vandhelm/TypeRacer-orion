import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { roomInvites, roomMembers, rooms, user } from "../../db/schema";
import { createMockDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { newInviteToken } from "../rooms/access";
import { createAuth } from "./auth";
import { GUEST_COOKIE, signGuest } from "./guest";
import { MAX_INVITES, revokeInvitesOf, type InviteView } from "./room-invites";
import { handleRoomsApi } from "./rooms-api";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
const SECRET = "guest-secret-guest-secret-guest-secret";

const IP_A = "203.0.113.10";
const IP_B = "198.51.100.20";

type Joined = { room: { code: string; members: { key: string; name: string }[] }; you: string };

async function setup() {
  const db = await createMockDatabase();
  const auth = createAuth(db);
  const signUp = async (name: string) => {
    await auth.api.signUpEmail({ body: { name, email: placeholderEmail(name), password: "sushi-roll-42", username: name, displayUsername: name } });
    const { headers } = await auth.api.signInUsername({ body: { username: name, password: "sushi-roll-42" }, returnHeaders: true });
    const [account] = await db.select({ playerId: user.playerId }).from(user).where(eq(user.displayUsername, name));
    return { cookie: headers.get("set-cookie")!.split(";")[0]!, playerId: account!.playerId! };
  };
  const sessions = new Map<string, string>();
  const freshGuest = (name: string) => `${GUEST_COOKIE}=${signGuest(name, SECRET)}`;
  const guest = (name: string) => sessions.get(name) ?? sessions.set(name, freshGuest(name)).get(name)!;
  /** ip : la première valeur de x-forwarded-for, comme derrière le proxy de Vercel ; null : sans en-tête. */
  const call = (method: string, path: string, cookie?: string, body?: unknown, ip: string | null = IP_A) =>
    handleRoomsApi(
      new Request(`http://localhost${path}`, {
        method,
        headers: { ...(cookie ? { cookie } : {}), ...(ip ? { "x-forwarded-for": `${ip}, 10.0.0.1` } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      db,
      auth,
      SECRET,
    );
  return { db, signUp, guest, freshGuest, call };
}

describe("SALLE-04 — the invitation token is unguessable", () => {
  test("at least 16 bytes (128 bits) of randomness, base64url", () => {
    const token = newInviteToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, "base64url").length).toBeGreaterThanOrEqual(16);
  });

  test("drawn from the random source it is given, never derived from anything else", () => {
    let asked = 0;
    const token = newInviteToken((count) => {
      asked = count;
      return new Uint8Array(count).fill(255);
    });
    expect(asked).toBeGreaterThanOrEqual(16);
    expect(Buffer.from(token, "base64url")).toEqual(Buffer.from(new Uint8Array(asked).fill(255)));
  });

  test("two tokens are never equal", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => newInviteToken()));
    expect(tokens.size).toBe(200);
  });
});

describe("SALLE-04 — one invitation link per guest, single use, bound to an IP", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  let host: { cookie: string; playerId: number };
  const open = async (visibility: "public" | "semi" | "private" = "private") =>
    ((await (await t.call("POST", "/api/rooms", host.cookie, { role: "player", settings: { visibility } })).json()) as Joined).room.code;
  const newInvite = async (code: string) => {
    const res = await t.call("POST", `/api/rooms/${code}/invites`, host.cookie);
    expect(res.status).toBe(201);
    return ((await res.json()) as { invite: InviteView }).invite;
  };
  const invitesOf = async (code: string) => ((await (await t.call("GET", `/api/rooms/${code}/invites`, host.cookie)).json()) as { invites: InviteView[] }).invites;
  const join = (cookie: string, invite: string, ip: string | null = IP_A) => t.call("POST", "/api/rooms/join", cookie, { invite }, ip);
  const membersNamed = (name: string) => t.db.$count(roomMembers, eq(roomMembers.guestName, name));

  beforeAll(async () => {
    t = await setup();
    host = await t.signUp("Hote_Liens");
  });

  test("a new room has no link yet; the host generates several distinct ones, all unused", async () => {
    const code = await open();
    expect(await invitesOf(code)).toEqual([]);
    const first = await newInvite(code);
    const second = await newInvite(code);
    expect(first.token).not.toBe(second.token);
    expect(await invitesOf(code)).toEqual([
      { token: first.token, status: "unused", usedBy: null, usedAt: null },
      { token: second.token, status: "unused", usedBy: null, usedAt: null },
    ]);
  });

  test("the room state does not carry any link: members never receive one", async () => {
    const code = await open("public");
    await newInvite(code);
    await t.call("POST", "/api/rooms/join", t.guest("Curieux_Lien"), { code });
    const asHost = await (await t.call("GET", `/api/rooms/${code}`, host.cookie)).json();
    const asMember = await (await t.call("GET", `/api/rooms/${code}`, t.guest("Curieux_Lien"))).json();
    expect(asHost).not.toHaveProperty("room.invite");
    expect(JSON.stringify(asMember)).not.toContain("invite");
  });

  test("a non-host member can neither list nor generate links (403)", async () => {
    const code = await open("public");
    await t.call("POST", "/api/rooms/join", t.guest("Pas_Hote_Liens"), { code });
    expect((await t.call("GET", `/api/rooms/${code}/invites`, t.guest("Pas_Hote_Liens"))).status).toBe(403);
    expect((await t.call("POST", `/api/rooms/${code}/invites`, t.guest("Pas_Hote_Liens"))).status).toBe(403);
    const [room] = await t.db.select({ id: rooms.id }).from(rooms).where(eq(rooms.code, code));
    expect(await t.db.$count(roomInvites, eq(roomInvites.roomId, room!.id))).toBe(0);
  });

  test("a stranger gets 404 and no session gets 401", async () => {
    const code = await open();
    expect((await t.call("GET", `/api/rooms/${code}/invites`, t.guest("Etranger_Liens"))).status).toBe(404);
    expect((await t.call("POST", `/api/rooms/${code}/invites`, (await t.signUp("Autre_Compte")).cookie)).status).toBe(404);
    expect((await t.call("GET", `/api/rooms/${code}/invites`)).status).toBe(401);
    expect((await t.call("POST", `/api/rooms/${code}/invites`)).status).toBe(401);
  });

  test("the status shows who used the link", async () => {
    const code = await open();
    const invite = await newInvite(code);
    expect((await join(t.guest("Alice_Lien"), invite.token)).status).toBe(200);
    const [status] = await invitesOf(code);
    expect(status).toMatchObject({ token: invite.token, status: "used", usedBy: "Alice_Lien" });
    expect(status!.usedAt).toBeString();
    expect(status).not.toHaveProperty("ip");
  });

  test("two guests with two links: each link shows its own guest", async () => {
    const code = await open();
    const a = await newInvite(code);
    const b = await newInvite(code);
    await join(t.guest("Duo_A"), a.token, IP_A);
    await join(t.guest("Duo_B"), b.token, IP_B);
    const byToken = Object.fromEntries((await invitesOf(code)).map((i) => [i.token, i.usedBy]));
    expect(byToken).toEqual({ [a.token]: "Duo_A", [b.token]: "Duo_B" });
  });

  test("used from IP A then from IP B by someone else: refused (403), nobody added", async () => {
    const code = await open();
    const { token } = await newInvite(code);
    expect((await join(t.guest("Premier_A"), token, IP_A)).status).toBe(200);
    const other = await join(t.guest("Second_B"), token, IP_B);
    expect(other.status).toBe(403);
    expect(await other.json()).toEqual({ error: "invite_taken" });
    expect(await membersNamed("Second_B")).toBe(0);
    expect((await invitesOf(code))[0]).toMatchObject({ usedBy: "Premier_A" });
  });

  test("the same person reuses the link from IP A to come back: accepted, no duplicate", async () => {
    const code = await open();
    const { token } = await newInvite(code);
    const first = (await (await join(t.guest("Revient_A"), token, IP_A)).json()) as Joined;
    expect((await t.call("POST", `/api/rooms/${code}/leave`, t.guest("Revient_A"))).status).toBe(200);
    const back = await join(t.guest("Revient_A"), token, IP_A);
    expect(back.status).toBe(200);
    expect(((await back.json()) as Joined).you).toBe(first.you);
    expect(await membersNamed("Revient_A")).toBe(1);
  });

  test("the same person from another IP is refused too", async () => {
    const code = await open();
    const { token } = await newInvite(code);
    await join(t.guest("Voyageur"), token, IP_A);
    await t.call("POST", `/api/rooms/${code}/leave`, t.guest("Voyageur"));
    expect((await join(t.guest("Voyageur"), token, IP_B)).status).toBe(403);
    expect(await membersNamed("Voyageur")).toBe(0);
  });

  test("a second person behind the same IP cannot share a link still in use (single use)", async () => {
    const code = await open();
    const { token } = await newInvite(code);
    await join(t.guest("Colocataire_1"), token, IP_A);
    expect((await join(t.guest("Colocataire_2"), token, IP_A)).status).toBe(403);
    expect(await membersNamed("Colocataire_2")).toBe(0);
  });

  test("a request without a known IP cannot claim a link; the link stays unused", async () => {
    const code = await open();
    const { token } = await newInvite(code);
    expect((await join(t.guest("Sans_IP"), token, null)).status).toBe(403);
    expect((await invitesOf(code))[0]).toMatchObject({ status: "unused", usedBy: null });
    expect((await join(t.guest("Sans_IP"), token, IP_A)).status).toBe(200);
  });

  test("a forged x-forwarded-for value is not an IP: refused", async () => {
    const code = await open();
    const { token } = await newInvite(code);
    expect((await join(t.guest("Faux_IP"), token, "not-an-ip")).status).toBe(403);
  });

  test("an existing member opening another link does not consume it", async () => {
    const code = await open();
    const first = await newInvite(code);
    const second = await newInvite(code);
    await join(t.guest("Deja_La"), first.token);
    expect((await join(t.guest("Deja_La"), second.token)).status).toBe(200);
    expect((await invitesOf(code)).find((i) => i.token === second.token)).toMatchObject({ status: "unused" });
  });

  test("a refused entry (race in progress) leaves the link unused", async () => {
    const code = await open();
    const { token } = await newInvite(code);
    await t.db.update(rooms).set({ status: "racing" }).where(eq(rooms.code, code));
    expect((await join(t.guest("Trop_Tard_Lien"), token)).status).toBe(409);
    await t.db.update(rooms).set({ status: "waiting" }).where(eq(rooms.code, code));
    expect((await invitesOf(code))[0]).toMatchObject({ status: "unused" });
  });

  test("a link of one room does not open another", async () => {
    const one = await open();
    const other = await open();
    const { token } = await newInvite(one);
    const { room } = (await (await join(t.guest("Bon_Salon"), token)).json()) as Joined;
    expect(room.code).toBe(one);
    expect(room.code).not.toBe(other);
  });

  test("the code alone does not open a private room", async () => {
    const code = await open("private");
    await newInvite(code);
    expect((await t.call("POST", "/api/rooms/join", t.guest("Code_Seul"), { code })).status).toBe(404);
    expect(await membersNamed("Code_Seul")).toBe(0);
  });

  test("an unknown or malformed token is refused", async () => {
    expect((await join(t.guest("Devin"), newInviteToken())).status).toBe(404);
    expect((await join(t.guest("Devin"), "x")).status).toBe(400);
    expect((await t.call("POST", "/api/rooms/join", t.guest("Devin"), { invite: 42 })).status).toBe(400);
  });

  test(`the host cannot generate more than ${MAX_INVITES} links in one room (409)`, async () => {
    const code = await open();
    const [room] = await t.db.select({ id: rooms.id }).from(rooms).where(eq(rooms.code, code));
    await t.db.insert(roomInvites).values(Array.from({ length: MAX_INVITES - 1 }, () => ({ roomId: room!.id, token: newInviteToken() })));
    expect((await t.call("POST", `/api/rooms/${code}/invites`, host.cookie)).status).toBe(201);
    const over = await t.call("POST", `/api/rooms/${code}/invites`, host.cookie);
    expect(over.status).toBe(409);
    expect(await over.json()).toEqual({ error: "invite_limit" });
  });

  test("revokeInvitesOf (expulsion, SALLE-07): the expelled member's link is refused afterwards", async () => {
    const code = await open();
    const kept = await newInvite(code);
    const { token } = await newInvite(code);
    await join(t.guest("Garde"), kept.token, IP_B);
    const { you } = (await (await join(t.guest("Expulse"), token, IP_A)).json()) as Joined;
    const [room] = await t.db.select({ id: rooms.id }).from(rooms).where(eq(rooms.code, code));
    // ce que fera l'expulsion : retirer le membre et révoquer ses liens
    await t.db.delete(roomMembers).where(and(eq(roomMembers.roomId, room!.id), eq(roomMembers.memberKey, you)));
    expect(await revokeInvitesOf(t.db, room!.id, you)).toBe(1);
    const back = await join(t.guest("Expulse"), token, IP_A);
    expect(back.status).toBe(404);
    expect(await membersNamed("Expulse")).toBe(0);
    const statuses = Object.fromEntries((await invitesOf(code)).map((i) => [i.token, i.status]));
    expect(statuses).toEqual({ [kept.token]: "used", [token]: "revoked" });
    // les liens des autres membres ne bougent pas
    await t.call("POST", `/api/rooms/${code}/leave`, t.guest("Garde"));
    expect((await join(t.guest("Garde"), kept.token, IP_B)).status).toBe(200);
  });

  test("revokeInvitesOf only touches this member in this room", async () => {
    const one = await open();
    const two = await open();
    const a = await newInvite(one);
    const b = await newInvite(two);
    const { you } = (await (await join(t.guest("Double_Salle"), a.token)).json()) as Joined;
    const [room] = await t.db.select({ id: rooms.id }).from(rooms).where(eq(rooms.code, two));
    expect(await revokeInvitesOf(t.db, room!.id, you)).toBe(0);
    expect((await invitesOf(one))[0]).toMatchObject({ status: "used" });
    expect((await invitesOf(two))[0]).toMatchObject({ token: b.token, status: "unused" });
  });

  test("once the room is closed, every link is refused, used or not", async () => {
    const code = await open();
    const used = await newInvite(code);
    const unused = await newInvite(code);
    await join(t.guest("Avant_Fermeture"), used.token);
    await t.call("POST", `/api/rooms/${code}/leave`, t.guest("Avant_Fermeture"));
    await t.call("POST", `/api/rooms/${code}/leave`, host.cookie); // le dernier ferme le salon
    const [row] = await t.db.select({ status: rooms.status }).from(rooms).where(eq(rooms.code, code));
    expect(row!.status).toBe("closed");
    expect((await join(t.guest("Avant_Fermeture"), used.token)).status).toBe(404);
    expect((await join(t.guest("Apres_Fermeture"), unused.token, IP_B)).status).toBe(404);
    expect(await membersNamed("Apres_Fermeture")).toBe(0);
  });

  test("a closed room gives no link list and generates no new link", async () => {
    const code = await open();
    await t.db.update(rooms).set({ status: "closed" }).where(eq(rooms.code, code));
    expect((await t.call("GET", `/api/rooms/${code}/invites`, host.cookie)).status).toBe(404);
    expect((await t.call("POST", `/api/rooms/${code}/invites`, host.cookie)).status).toBe(404);
  });
});
