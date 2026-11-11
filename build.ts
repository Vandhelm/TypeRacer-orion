import tailwind from "bun-plugin-tailwind";

const result = await Bun.build({
  entrypoints: ["./home.html", "./room.html", "./game.html", "./podium.html", "./profile.html"],
  outdir: "./dist",
  minify: true,
  plugins: [tailwind],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

console.log(`Built ${result.outputs.length} files to dist/`);

// L'API pour la fonction Vercel (api/index.js), avec toutes ses dépendances dans un seul fichier.
const api = await Bun.build({ entrypoints: ["./src/server/api.ts"], outdir: "./.server", target: "bun", naming: "api.js" });
if (!api.success) {
  for (const log of api.logs) console.error(log);
  process.exit(1);
}
console.log("Built the API bundle to .server/api.js");
