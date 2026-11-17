// Photo de profil (AUTH-04) : le navigateur l'envoie déjà réduite, le serveur revérifie le format et le poids.
import type { Auth } from "./auth";

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/** Le vrai format d'après les premiers octets (le type annoncé par le navigateur ne prouve rien). null : refusé. */
export function avatarType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  const at = (offset: number, ...values: number[]) => values.every((value, i) => bytes[offset + i] === value);
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}

/** POST : enregistre la photo (champ « avatar »). DELETE : la retire. La photo est gardée dans user.image. */
export async function handleAvatar(req: Request, auth: Auth): Promise<Response> {
  if (req.method !== "POST" && req.method !== "DELETE") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  let image: string | null = null;
  if (req.method === "POST") {
    if (Number(req.headers.get("content-length") ?? 0) > AVATAR_MAX_BYTES + 64 * 1024) return Response.json({ error: "too_large" }, { status: 413 });
    const file = (await req.formData().catch(() => null))?.get("avatar");
    if (!(file instanceof Blob)) return Response.json({ error: "missing_file" }, { status: 400 });
    if (file.size > AVATAR_MAX_BYTES) return Response.json({ error: "too_large" }, { status: 413 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = avatarType(bytes);
    if (!type) return Response.json({ error: "bad_type" }, { status: 415 });
    image = `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
  }
  await auth.api.updateUser({ headers: req.headers, body: { image } });
  return Response.json({ image });
}
