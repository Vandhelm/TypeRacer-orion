import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // TypeScript 7 (compilateur natif) n'expose pas l'API que `next build` utilise pour vérifier les types.
  // Les types sont vérifiés par `bun run typecheck` (tsc --noEmit), en local et dans la CI.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
