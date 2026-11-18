// Ancien build des pages par Bun (avant Next.js). Plus utilisé par Vercel ; gardé le temps de la migration.
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
