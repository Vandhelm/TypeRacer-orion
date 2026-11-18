// AUTH-03 : sans photo (un invité n'en a jamais), un avatar généré à partir du nom. Déterministe : le même nom
// donne toujours le même avatar, sur chaque page et chaque appareil ; deux noms donnent presque toujours deux teintes.

/** FNV-1a 32 bits : rapide, stable, assez dispersé pour des pseudonymes courts. */
function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type GeneratedAvatar = { initial: string; hue: number; angle: number };

/** La teinte du poisson (0–359), son inclinaison (−30° à 30°) et l'initiale du nom. */
export function generatedAvatar(name: string): GeneratedAvatar {
  const h = hash(name);
  return {
    initial: [...name][0]?.toUpperCase() ?? "?",
    hue: h % 360,
    angle: ((h >>> 9) % 61) - 30,
  };
}
