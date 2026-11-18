import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import { createMockDatabase } from "../../db/mocks/test-database";
import { handleAvatar } from "./account";
import type { Auth } from "./auth";
import { GUEST_COOKIE, readGuest, verifyGuest } from "./guest";
import { handleStats } from "./races";
import { roomQuery } from "./room-gate";

const SECRET = "guest-secret-guest-secret-guest-secret";
const db = await createMockDatabase();

describe("TECH-07 — identifiant de /api/players/:name/stats", () => {
  test("un joueur connu répond 200", async () => {
    expect((await handleStats("Corail_418", db)).status).toBe(200);
  });
  test("un joueur inconnu répond 404", async () => {
    expect((await handleStats("Personne_999", db)).status).toBe(404);
  });
  test("un encodage invalide (%E0%A4%A) répond 400 et ne lève pas", async () => {
    expect((await handleStats("%E0%A4%A", db)).status).toBe(400);
  });
  test("un caractère de contrôle (%00) répond 400", async () => {
    expect((await handleStats("a%00b", db)).status).toBe(400);
  });
  test("un identifiant trop long répond 400", async () => {
    expect((await handleStats("a".repeat(65), db)).status).toBe(400);
  });
  test("un identifiant d'injection SQL est traité comme un nom : 404", async () => {
    expect((await handleStats(encodeURIComponent("x'; drop table players;--"), db)).status).toBe(404);
  });
  test("un identifiant encodé deux fois n'est décodé qu'une fois", async () => {
    expect((await handleStats("Corail_418%2541", db)).status).toBe(404);
  });
});

const auth = (signedIn = true) => ({ api: { getSession: async () => (signedIn ? { user: { id: "u1" } } : null) } }) as unknown as Auth;
const saved: (string | null)[] = [];
const save = async (_id: string, image: string | null) => void saved.push(image);
const post = (body: BodyInit, headers: Record<string, string> = {}, method = "POST") =>
  new Request("http://localhost/api/account/avatar", { method, body, headers });
const form = (entries: Record<string, string | Blob>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
};
const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#3a7" } }).png().toBuffer();

describe("TECH-07 — corps de /api/account/avatar", () => {
  test("un champ avatar texte (pas un fichier) répond 400", async () => {
    expect((await handleAvatar(post(form({ avatar: "pas un fichier" })), auth(), save)).status).toBe(400);
  });
  test("un corps JSON au lieu d'un formulaire répond 400", async () => {
    const res = await handleAvatar(post(JSON.stringify({ avatar: null }), { "content-type": "application/json" }), auth(), save);
    expect(res.status).toBe(400);
  });
  test("un corps vide répond 400", async () => {
    expect((await handleAvatar(post(""), auth(), save)).status).toBe(400);
  });
  test("un formulaire multipart tronqué répond 400", async () => {
    const res = await handleAvatar(post('--x\r\ncontent-disposition: form-data; name="avatar"', { "content-type": "multipart/form-data; boundary=x" }), auth(), save);
    expect(res.status).toBe(400);
  });
  test("un content-length mal formé répond 400", async () => {
    for (const value of ["abc", "-5", "1e3", "NaN"]) {
      const res = await handleAvatar(post(form({ avatar: new Blob([png]) }), { "content-length": value }), auth(), save);
      expect(res.status).toBe(400);
    }
  });
  test("un champ en trop est ignoré", async () => {
    const res = await handleAvatar(post(form({ avatar: new Blob([png]), role: "admin" })), auth(), save);
    expect(res.status).toBe(200);
  });
  test("une session absente reste 401 avant toute lecture du corps", async () => {
    expect((await handleAvatar(post("x"), auth(false), save)).status).toBe(401);
  });
});

describe("TECH-07 — cookie d'invité et paramètres de page", () => {
  test("un cookie démesuré est refusé", () => {
    expect(verifyGuest("a".repeat(100_000) + "." + "b".repeat(100_000), SECRET)).toBeNull();
    expect(readGuest(new Headers({ cookie: `${GUEST_COOKIE}=${"a".repeat(100_000)}.b` }), SECRET)).toBeNull();
  });
  test("roomQuery ignore des searchParams du mauvais type", () => {
    expect(roomQuery({ code: 12, invite: [1] }).toString()).toBe("");
    expect(roomQuery(null).toString()).toBe("");
    expect(roomQuery("code=1").toString()).toBe("");
  });
  test("roomQuery borne la longueur des valeurs", () => {
    expect(roomQuery({ code: "x".repeat(10_000) }).get("code")).toBeNull();
  });
});
