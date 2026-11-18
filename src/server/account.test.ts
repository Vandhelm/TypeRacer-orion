import { describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { players, user } from "../../db/schema";
import { MIGRATIONS_DIR } from "../../db/client";
import { createMockDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { createAuth, type Auth } from "./auth";
import { AVATAR_MAX_BYTES, avatarType, handleAvatar, resizeAvatar, saveAvatar } from "./account";
import { playerStats } from "./races";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";

const bytes = (...values: number[]) => new Uint8Array(values);

describe("avatarType", () => {
  test("reconnaît JPEG, PNG et WebP à leurs premiers octets", () => {
    expect(avatarType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(avatarType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(avatarType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
  });

  test("refuse le reste, même annoncé comme une image", () => {
    expect(avatarType(new TextEncoder().encode("GIF89a"))).toBeNull();
    expect(avatarType(new TextEncoder().encode("<svg xmlns="))).toBeNull();
    expect(avatarType(bytes())).toBeNull();
  });
});

const picture = (width: number, height: number, format: "png" | "jpeg" | "webp" = "png") =>
  sharp({ create: { width, height, channels: 3, background: "#3a7" } })[format]().toBuffer();

const fakeAuth = ({ signedIn = true } = {}) => {
  const saved: { image: string | null }[] = [];
  const auth = {
    api: {
      getSession: async () => (signedIn ? { user: { id: "u1" } } : null),
    },
  } as unknown as Auth;
  const save = async (_userId: string, image: string | null) => {
    saved.push({ image });
  };
  return { auth, saved, save };
};

const upload = (data: Uint8Array) => {
  const form = new FormData();
  form.append("avatar", new Blob([new Uint8Array(data)]), "avatar");
  return new Request("http://localhost/api/account/avatar", { method: "POST", body: form });
};

describe("AUTH-04 — redimensionnement côté serveur", () => {
  test("une grande image devient un carré WebP de 256 px", async () => {
    const out = await resizeAvatar(await picture(1200, 800, "jpeg"));
    expect(out).not.toBeNull();
    const meta = await sharp(out!).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 256, 256]);
  });

  test("une petite image est recadrée en carré sans être agrandie", async () => {
    const meta = await sharp((await resizeAvatar(await picture(120, 90)))!).metadata();
    expect([meta.width, meta.height]).toEqual([90, 90]);
  });

  test("des octets magiques valides suivis de déchets sont refusés", async () => {
    expect(await resizeAvatar(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3))).toBeNull();
  });

  test("le serveur enregistre une image réduite, même si le client envoie l'original", async () => {
    const { auth, saved, save } = fakeAuth();
    const response = await handleAvatar(upload(await picture(1000, 1000, "png")), auth, save);
    expect(response.status).toBe(200);
    const { image } = (await response.json()) as { image: string };
    expect(image.startsWith("data:image/webp;base64,")).toBe(true);
    expect(saved).toEqual([{ image }]);
    const meta = await sharp(Buffer.from(image.split(",")[1]!, "base64")).metadata();
    expect([meta.width, meta.height]).toEqual([256, 256]);
  });

  test("une image indécodable reçoit 415 et rien n'est enregistré", async () => {
    const { auth, saved, save } = fakeAuth();
    const response = await handleAvatar(upload(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0)), auth, save);
    expect(response.status).toBe(415);
    expect(saved).toEqual([]);
  });
});

const padded = async (size: number) => {
  const data = new Uint8Array(size);
  data.set(await picture(64, 64, "png"));
  return data;
};

describe("AUTH-04 — garde-fous du téléversement", () => {
  test("sans session, 401 et rien n'est enregistré", async () => {
    const { auth, saved, save } = fakeAuth({ signedIn: false });
    const response = await handleAvatar(upload(await picture(64, 64)), auth, save);
    expect(response.status).toBe(401);
    expect(saved).toEqual([]);
  });

  test("2 Mo + 1 octet reçoit 413 et rien n'est enregistré", async () => {
    const { auth, saved, save } = fakeAuth();
    const response = await handleAvatar(upload(await padded(AVATAR_MAX_BYTES + 1)), auth, save);
    expect(response.status).toBe(413);
    expect(saved).toEqual([]);
  });

  test("exactement 2 Mo n'est pas refusé pour sa taille", async () => {
    const { auth, save } = fakeAuth();
    const response = await handleAvatar(upload(await padded(AVATAR_MAX_BYTES)), auth, save);
    expect(response.status).not.toBe(413);
  });

  test("un GIF reçoit 415 et rien n'est enregistré", async () => {
    const { auth, saved, save } = fakeAuth();
    const response = await handleAvatar(upload(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0)), auth, save);
    expect(response.status).toBe(415);
    expect(saved).toEqual([]);
  });
});

describe("AUTH-04 — la route enregistre la photo avec le vrai Better Auth", () => {
  test("POST enregistre un WebP de 256 px au plus, DELETE remet null", async () => {
    const db = await createMockDatabase();
    const auth = createAuth(db);
    await auth.api.signUpEmail({ body: { name: "Photo_Vraie", email: placeholderEmail("Photo_Vraie"), password: "sushi-roll-42", username: "Photo_Vraie", displayUsername: "Photo_Vraie" } });
    const { headers } = await auth.api.signInUsername({ body: { username: "Photo_Vraie", password: "sushi-roll-42" }, returnHeaders: true });
    const cookie = headers.get("set-cookie")!.split(";")[0]!;
    const stored = async () => (await db.select({ image: user.image }).from(user).where(eq(user.username, "photo_vraie")))[0]!.image;
    const withCookie = (req: Request) => new Request(req, { headers: { cookie } });

    const posted = await handleAvatar(withCookie(upload(await picture(900, 600, "jpeg"))), auth, saveAvatar(db));
    expect(posted.status).toBe(200);
    const image = await stored();
    expect(image?.startsWith("data:image/webp;base64,")).toBe(true);
    const meta = await sharp(Buffer.from(image!.split(",")[1]!, "base64")).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 256, 256]);

    const removed = await handleAvatar(withCookie(new Request("http://localhost/api/account/avatar", { method: "DELETE" })), auth, saveAvatar(db));
    expect(removed.status).toBe(200);
    expect(await stored()).toBeNull();
  });
});

describe("AUTH-04 — les photos enregistrées avant la réduction serveur", () => {
  const LEGACY = "https://avatars.githubusercontent.com/u/1";
  const insertAccount = async (db: Awaited<ReturnType<typeof createMockDatabase>>, name: string, image: string | null) => {
    const [player] = await db.insert(players).values({ name }).returning();
    await db.insert(user).values({ id: `u-${name}`, name, email: placeholderEmail(name), username: name.toLowerCase(), image, playerId: player!.id });
  };
  const imageOf = async (db: Awaited<ReturnType<typeof createMockDatabase>>, name: string) =>
    (await db.select({ image: user.image }).from(user).where(eq(user.name, name)))[0]!.image;

  test("la migration efface les images qui ne sont pas un WebP réduit par le serveur", async () => {
    const db = await createMockDatabase();
    const webp = `data:image/webp;base64,${(await picture(64, 64, "webp")).toString("base64")}`;
    await insertAccount(db, "Vieux_Github", LEGACY);
    await insertAccount(db, "Vieux_Png", "data:image/png;base64,iVBORw0KGgo=");
    await insertAccount(db, "Photo_Webp", webp);
    await insertAccount(db, "Sans_Photo", null);
    await db.execute(sql.raw(await Bun.file(`${MIGRATIONS_DIR}/0007_legacy_avatars.sql`).text()));
    expect(await imageOf(db, "Vieux_Github")).toBeNull();
    expect(await imageOf(db, "Vieux_Png")).toBeNull();
    expect(await imageOf(db, "Photo_Webp")).toBe(webp);
    expect(await imageOf(db, "Sans_Photo")).toBeNull();
  });

  test("le profil n'affiche jamais une ancienne image non réduite", async () => {
    const db = await createMockDatabase();
    await insertAccount(db, "Vieux_Profil", LEGACY);
    expect((await playerStats(db, "Vieux_Profil"))!.image).toBeNull();
  });
});
