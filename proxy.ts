// TECH-07 : Next.js répond 500 à une route /api/* dont le chemin contient un encodage invalide (%E0%A4%A),
// avant d'atteindre handleApi. Ce proxy refuse ces chemins avec 400, avant le routeur.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

const DecodablePath = z.string().refine((path) => {
  try {
    decodeURIComponent(path);
    return true;
  } catch {
    return false;
  }
});

export function proxy(req: NextRequest) {
  if (!DecodablePath.safeParse(req.nextUrl.pathname).success) return NextResponse.json({ error: "bad_path" }, { status: 400 });
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
