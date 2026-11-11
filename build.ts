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
// Better Auth essaie de charger @opentelemetry/api s'il est installé. Absent, Bun voudrait l'installer à la volée,
// ce que le disque en lecture seule de Vercel interdit : on le remplace par un module qui échoue proprement.
const optionalModules: Bun.BunPlugin = {
  name: "optional-modules",
  setup(build) {
    build.onResolve({ filter: /^@opentelemetry\/api$/ }, (args) => ({ path: args.path, namespace: "missing" }));
    build.onLoad({ filter: /.*/, namespace: "missing" }, (args) => ({ contents: `throw new Error(${JSON.stringify(`${args.path} is not installed`)});`, loader: "js" }));
  },
};
const api = await Bun.build({ entrypoints: ["./src/server/api.ts"], outdir: "./.server", target: "bun", naming: "api.js", plugins: [optionalModules] });
if (!api.success) {
  for (const log of api.logs) console.error(log);
  process.exit(1);
}
console.log("Built the API bundle to .server/api.js");
