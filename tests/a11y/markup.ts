// A11Y-03 : lecture du HTML rendu côté serveur (renderToStaticMarkup) pour les tests unitaires : champs sans libellé,
// SVG ni masqués ni nommés. Pas de DOM : de simples expressions régulières sur un balisage produit par React.

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

/** Les champs (input, textarea, select) qui n'ont ni aria-label, ni aria-labelledby, ni label for=, ni label parent. */
export function unlabelledFields(html: string): string[] {
  const labelled = new Set([...html.matchAll(/<label[^>]*\sfor="([^"]+)"/g)].map((m) => m[1]));
  const found: string[] = [];
  for (const match of html.matchAll(/<(input|textarea|select)\b[^>]*>/g)) {
    const tag = match[0];
    if (attr(tag, "type") === "hidden") continue;
    if (attr(tag, "aria-label")?.trim() || attr(tag, "aria-labelledby")) continue;
    const id = attr(tag, "id");
    if (id && labelled.has(id)) continue;
    // Un label ouvert avant le champ et pas encore refermé : le champ est dedans.
    const before = html.slice(0, match.index);
    if (before.lastIndexOf("<label") > before.lastIndexOf("</label>")) continue;
    found.push(tag);
  }
  return found;
}

/** Les <svg> qui ne sont ni masqués (aria-hidden sur le svg lui-même) ni nommés (role="img" et aria-label). */
export function unnamedSvgs(html: string): string[] {
  return [...html.matchAll(/<svg\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => attr(tag, "aria-hidden") !== "true" && !(attr(tag, "role") === "img" && attr(tag, "aria-label")?.trim()));
}
