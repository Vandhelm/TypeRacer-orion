// Serveur local : les pages (avec rechargement à chaud) et l'API. En ligne, Vercel sert les pages et api/index.ts l'API.
import game from "./game.html";
import home from "./home.html";
import podium from "./podium.html";
import profile from "./profile.html";
import room from "./room.html";
import { handleApi } from "./src/server/api";

const server = Bun.serve({
  port: Number(process.env.PORT) || 3000,
  development: process.env.NODE_ENV !== "production",
  routes: {
    "/": home,
    "/home": home,
    "/room": room,
    "/game": game,
    "/podium": podium,
    "/profile": profile,
    "/api/*": handleApi,
  },
});

console.log(`O.R.I.O.N → ${server.url}`);
