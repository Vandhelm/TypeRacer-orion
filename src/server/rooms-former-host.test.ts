// SEC-01 : les actions réservées à l'hôte (lancer, configurer, générer des liens, expulser, fermer) sont autorisées côté
// serveur. Ici : celui qui a été hôte ne l'est plus après un transfert (SALLE-08), et un invité ne le devient jamais.
import { beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { roomInvites, roomMembers, rooms } from "../../db/schema";
import { roomsFixture } from "./rooms.fixture";

type Fixture = Awaited<ReturnType<typeof roomsFixture>>;

const arrivedAgo = (t: Fixture, key: string, agoMs: number) => t.db.update(roomMembers).set({ joinedAt: sql`now() - ${agoMs} * interval '1 millisecond'` }).where(eq(roomMembers.memberKey, key));
const roomRow = async (t: Fixture, code: string) => (await t.db.select().from(rooms).where(eq(rooms.code, code)))[0]!;
/** Ce qu'une action d'hôte changerait : le salon, ses membres, ses liens. */
const snapshot = async (t: Fixture, code: string) => {
  const room = await roomRow(t, code);
  const members = (await t.db.select({ key: roomMembers.memberKey, role: roomMembers.role, seat: roomMembers.seat }).from(roomMembers).where(eq(roomMembers.roomId, room.id))).sort((a, b) => a.key.localeCompare(b.key));
  const invites = await t.db.$count(roomInvites, eq(roomInvites.roomId, room.id));
  return { room, members, invites };
};

/** Les cinq actions d'hôte, chacune avec son statut et son code d'erreur. */
const hostActions = async (t: Fixture, code: string, cookie: string, target: string) => {
  const answers = [
    await t.call("POST", `/api/rooms/${code}/launch`, cookie),
    await t.call("PATCH", `/api/rooms/${code}`, cookie, { settings: { language: "en" } }),
    await t.call("POST", `/api/rooms/${code}/invites`, cookie),
    await t.call("POST", `/api/rooms/${code}/kick`, cookie, { member: target }),
    await t.call("POST", `/api/rooms/${code}/close`, cookie),
  ];
  return Promise.all(answers.map(async (res) => [res.status, ((await res.json()) as { error?: string }).error]));
};

describe("SEC-01 — host actions are authorized on the server, against the current host", () => {
  let t: Fixture;
  beforeAll(async () => {
    t = await roomsFixture();
  });

  test("the former host after a transfer: 404 on every host action while gone, 403 not_host once back by code, room unchanged", async () => {
    const { room, host } = await t.open("Ancien_Hote");
    const a = await t.signUp("Ancien_Heritier");
    const ka = (await t.join(a.cookie, { code: room.code })).body.you;
    expect((await t.call("POST", `/api/rooms/${room.code}/leave`, host.cookie)).status).toBe(200);
    expect((await roomRow(t, room.code)).hostId).toBe(a.playerId);

    const gone = await snapshot(t, room.code);
    expect(await hostActions(t, room.code, host.cookie, ka)).toEqual(Array.from({ length: 5 }, () => [404, "not_found"]));
    expect(await snapshot(t, room.code)).toEqual(gone);

    expect((await t.join(host.cookie, { code: room.code })).status).toBe(200);
    const back = await snapshot(t, room.code);
    expect(await hostActions(t, room.code, host.cookie, ka)).toEqual(Array.from({ length: 5 }, () => [403, "not_host"]));
    expect(await snapshot(t, room.code)).toEqual(back);
    expect(back.room.hostId).toBe(a.playerId);
    expect(back.room.status).toBe("waiting");
  });

  test("a guest who arrived before an account never inherits the host role: it goes to the account, and the guest cannot launch", async () => {
    const { room, host } = await t.open("Hote_Avant_Invite");
    const g = t.guest("Invite_Ancien");
    const kg = (await t.join(g, { code: room.code })).body.you;
    const a = await t.signUp("Compte_Apres");
    const ka = (await t.join(a.cookie, { code: room.code })).body.you;
    await arrivedAgo(t, kg, 30_000);
    await arrivedAgo(t, ka, 10_000);
    expect((await t.call("POST", `/api/rooms/${room.code}/leave`, host.cookie)).status).toBe(200);
    expect((await roomRow(t, room.code)).hostId).toBe(a.playerId);
    expect((await t.read(g, room.code)).body.room.host).toBe(ka);
    const before = await snapshot(t, room.code);
    const res = await t.call("POST", `/api/rooms/${room.code}/launch`, g);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe("not_host");
    expect(await snapshot(t, room.code)).toEqual(before);
  });
});
