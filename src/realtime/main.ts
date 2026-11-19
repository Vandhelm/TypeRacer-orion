// Lancement du serveur temps réel : `bun run realtime` (en local, `bun run dev` le démarre avec Next.js).
// Hébergé à part de Vercel (Fly.io, voir Dockerfile.realtime et fly.toml) ; voir docs/ARCHITECTURE.md.
import { z } from "zod";
import { connect } from "../../db/client";
import { roomChanges } from "../server/room-events";
import { createRoomBackend } from "./room-backend";
import { createRealtimeServer, type RealtimeOptions } from "./server";
import { realtimeSecret } from "./ticket";

type Env = Record<string, string | undefined>;

const Port = z.coerce.number().int().min(0).max(65535);

export function realtimeConfig(env: Env = process.env): Required<Pick<RealtimeOptions, "port" | "hostname" | "secret" | "allowedOrigins">> {
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
  // Avec DATABASE_URL, la page salle suit l'état du salon (SALLE-03 à 09) ; sans, seulement présence et progression.
  const database = process.env.DATABASE_URL ? connect() : null;
  const rooms = database ? createRoomBackend(database.db, roomChanges(database.listen)) : undefined;
  if (!rooms) console.warn("DATABASE_URL is not set: rooms are not followed in real time.");
  const server = createRealtimeServer({ ...realtimeConfig(), rooms });
  console.log(`O.R.I.O.N realtime → ws://localhost:${server.port}`);
}
