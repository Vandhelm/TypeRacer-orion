import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import type { Auth } from "./auth";
import { AVATAR_MAX_BYTES, avatarType, handleAvatar, resizeAvatar } from "./account";

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
      updateUser: async ({ body }: { body: { image: string | null } }) => {
        saved.push(body);
        return { status: true };
      },
    },
  } as unknown as Auth;
  return { auth, saved };
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
    const { auth, saved } = fakeAuth();
    const response = await handleAvatar(upload(await picture(1000, 1000, "png")), auth);
    expect(response.status).toBe(200);
    const { image } = (await response.json()) as { image: string };
    expect(image.startsWith("data:image/webp;base64,")).toBe(true);
    expect(saved).toEqual([{ image }]);
    const meta = await sharp(Buffer.from(image.split(",")[1]!, "base64")).metadata();
    expect([meta.width, meta.height]).toEqual([256, 256]);
  });

  test("une image indécodable reçoit 415 et rien n'est enregistré", async () => {
    const { auth, saved } = fakeAuth();
    const response = await handleAvatar(upload(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0)), auth);
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
    const { auth, saved } = fakeAuth({ signedIn: false });
    const response = await handleAvatar(upload(await picture(64, 64)), auth);
    expect(response.status).toBe(401);
    expect(saved).toEqual([]);
  });

  test("2 Mo + 1 octet reçoit 413 et rien n'est enregistré", async () => {
    const { auth, saved } = fakeAuth();
    const response = await handleAvatar(upload(await padded(AVATAR_MAX_BYTES + 1)), auth);
    expect(response.status).toBe(413);
    expect(saved).toEqual([]);
  });

  test("exactement 2 Mo n'est pas refusé pour sa taille", async () => {
    const { auth } = fakeAuth();
    const response = await handleAvatar(upload(await padded(AVATAR_MAX_BYTES)), auth);
    expect(response.status).not.toBe(413);
  });

  test("un GIF reçoit 415 et rien n'est enregistré", async () => {
    const { auth, saved } = fakeAuth();
    const response = await handleAvatar(upload(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0)), auth);
    expect(response.status).toBe(415);
    expect(saved).toEqual([]);
  });
});
