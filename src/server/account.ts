// Photo de profil (AUTH-04) : le serveur revérifie le format et le poids, puis réduit lui-même l'image,
// sans se fier à la réduction faite par le navigateur.
import { eq, isNotNull } from "drizzle-orm";
import sharp from "sharp";
import { z } from "zod";
import type { Db } from "../../db/client";
import * as schema from "../../db/schema";
import type { Auth } from "./auth";

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_SIZE = 256;

/** Le vrai format d'après les premiers octets (le type annoncé par le navigateur ne prouve rien). null : refusé. */
export function avatarType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  const at = (offset: number, ...values: number[]) => values.every((value, i) => bytes[offset + i] === value);
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}

/** Carré central de 256 px au plus (jamais agrandi), en WebP, sans métadonnées. null : l'image ne se décode pas. */
export async function resizeAvatar(bytes: Uint8Array): Promise<Buffer | null> {
  try {
    const image = sharp(bytes, { limitInputPixels: 40_000_000, failOn: "error" }).rotate();
    const { width, height } = await image.metadata();
    const side = Math.min(AVATAR_SIZE, width ?? 0, height ?? 0);
    if (!side) return null;
    return await image.resize(side, side, { fit: "cover", position: "centre" }).webp({ quality: 86 }).toBuffer();
  } catch {
    return null;
  }
}

/** Une photo déjà réduite par le serveur : un carré WebP de 256 px au plus. */
async function isReduced(bytes: Uint8Array) {
  if (avatarType(bytes) !== "image/webp") return false;
  const { width, height } = await sharp(bytes).metadata().catch(() => ({ width: 0, height: 0 }));
  return Boolean(width) && width === height && width! <= AVATAR_SIZE;
}

/**
 * Lancé après chaque migration (db/cli.ts) : les photos écrites avant la réduction côté serveur sont réduites
 * à leur tour, celles qui ne se décodent pas (ou qui ne sont pas JPEG, PNG ou WebP) sont effacées.
 * Une photo déjà réduite n'est pas retouchée : la relancer ne change rien. Renvoie le nombre de comptes modifiés.
 */
export async function normalizeStoredAvatars(db: Db): Promise<number> {
  const rows = await db.select({ id: schema.user.id, image: schema.user.image }).from(schema.user).where(isNotNull(schema.user.image));
  let changed = 0;
  for (const { id, image } of rows) {
    const base64 = /^data:image\/(?:jpeg|png|webp);base64,(.+)$/s.exec(image!)?.[1];
    const bytes = base64 ? new Uint8Array(Buffer.from(base64, "base64")) : null;
    if (bytes && (await isReduced(bytes))) continue;
    const resized = bytes && avatarType(bytes) ? await resizeAvatar(bytes) : null;
    await saveAvatar(db)(id, resized ? `data:image/webp;base64,${resized.toString("base64")}` : null);
    changed++;
  }
  return changed;
}

export type SaveAvatar = (userId: string, image: string | null) => Promise<void>;

/** Écrit user.image directement : POST /api/auth/update-user refuse `image` (voir auth.ts). */
export const saveAvatar =
  (db: Db): SaveAvatar =>
  async (userId, image) => {
    await db.update(schema.user).set({ image, updatedAt: new Date() }).where(eq(schema.user.id, userId));
  };

// TECH-07 : en-tête content-length (entier décimal) et champ de formulaire « avatar » (un fichier, pas du texte).
const ContentLength = z.string().regex(/^\d{1,15}$/).optional();
const AvatarFile = z.instanceof(Blob);

/** POST : enregistre la photo (champ « avatar »). DELETE : la retire. La photo est gardée dans user.image. */
export async function handleAvatar(req: Request, auth: Auth, save: SaveAvatar): Promise<Response> {
  if (req.method !== "POST" && req.method !== "DELETE") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  let image: string | null = null;
  if (req.method === "POST") {
    const length = ContentLength.safeParse(req.headers.get("content-length") ?? undefined);
    if (!length.success) return Response.json({ error: "bad_request" }, { status: 400 });
    if (Number(length.data ?? 0) > AVATAR_MAX_BYTES + 64 * 1024) return Response.json({ error: "too_large" }, { status: 413 });
    const field = AvatarFile.safeParse((await req.formData().catch(() => null))?.get("avatar"));
    if (!field.success) return Response.json({ error: "missing_file" }, { status: 400 });
    const file = field.data;
    if (file.size > AVATAR_MAX_BYTES) return Response.json({ error: "too_large" }, { status: 413 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const resized = avatarType(bytes) ? await resizeAvatar(bytes) : null;
    if (!resized) return Response.json({ error: "bad_type" }, { status: 415 });
    image = `data:image/webp;base64,${resized.toString("base64")}`;
  }
  await save(session.user.id, image);
  return Response.json({ image });
}
