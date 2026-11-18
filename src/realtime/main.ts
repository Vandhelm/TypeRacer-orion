// Lancement du serveur temps réel : `bun run realtime` (en local, `bun run dev` le démarre avec Next.js).
// Hébergé à part de Vercel (Fly.io, voir Dockerfile.realtime et fly.toml) ; voir docs/ARCHITECTURE.md.
import { z } from "zod";
import { createRealtimeServer, type RealtimeOptions } from "./server";
import { realtimeSecret } from "./ticket";

type Env = Record<string, string | undefined>;

const Port = z.coerce.number().int().min(0).max(65535);

export function realtimeConfig(env: Env = process.env): Required<RealtimeOptions> {
  const origins = env.REALTIME_ALLOWED_ORIGINS || env.BETTER_AUTH_URL || "http://localhost:3000";
  return {
    // REALTIME_PORT d'abord : en local, PORT est celui de Next.js. PORT sert de repli pour un hébergeur qui l'impose.
    port: Port.parse(env.REALTIME_PORT || env.PORT || "3001"),
    // IPv4 et IPv6 : « localhost » peut viser ::1.
    hostname: "::",
    secret: realtimeSecret(env),
    allowedOrigins: origins.split(",").map((origin) => origin.trim()).filter(Boolean),
  };
}

if (import.meta.main) {
  const server = createRealtimeServer(realtimeConfig());
  console.log(`O.R.I.O.N realtime → ws://localhost:${server.port}`);
}
