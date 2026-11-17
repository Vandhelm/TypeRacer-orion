// Photo de profil (AUTH-04) : vérifiée ici pour répondre tout de suite, recadrée en carré et réduite avant l'envoi.
export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const SIZE = 256;

export type AvatarProblem = "type" | "size";

export function avatarProblem(file: File): AvatarProblem | null {
  if (!(AVATAR_TYPES as readonly string[]).includes(file.type)) return "type";
  if (file.size > AVATAR_MAX_BYTES) return "size";
  return null;
}

/** Le centre de l'image, en carré de 256 px, en WebP (PNG si le navigateur ne sait pas écrire le WebP). */
export async function shrinkAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.min(SIZE, side);
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("avatar"))), "image/webp", 0.86));
}

/** Envoie la photo (ou la retire avec null). Rend la nouvelle image, ou une erreur du serveur. */
export async function saveAvatar(blob: Blob | null): Promise<{ image: string | null } | { error: string }> {
  const body = blob ? new FormData() : undefined;
  if (blob) body!.append("avatar", blob, "avatar");
  const response = await fetch("/api/account/avatar", { method: blob ? "POST" : "DELETE", body, credentials: "same-origin" });
  const data = await response.json().catch(() => ({}));
  return response.ok ? { image: data.image ?? null } : { error: data.error ?? "failed" };
}
