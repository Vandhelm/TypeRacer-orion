// DES-05 : le thème choisi. Deux thèmes, tous deux sombres : celui d'origine (par défaut) et « couleurs adaptées »
// (`cvd`, daltonismes, tokens dans src/styles/base/tokens.css). Le choix vit dans un cookie que le serveur lit
// (src/theme/request.ts) pour rendre <html data-theme> dès le premier octet : aucun flash, aucun script inline.
// Rien ici ne touche document à l'import : sûr dans les composants serveur et les tests.

export const THEME_COOKIE = "orion-theme";
export const THEMES = ["default", "cvd"] as const;
export type Theme = (typeof THEMES)[number];

const isTheme = (value: unknown): value is Theme => THEMES.includes(value as Theme);

/** Le thème mémorisé ; sans cookie, ou avec une valeur inconnue, le thème par défaut. */
export const resolveTheme = (value: string | null | undefined): Theme => (isTheme(value) ? value : "default");

/** Valeur à écrire dans document.cookie pour mémoriser le choix un an, sur tout le site. */
export const themeCookie = (theme: Theme) => `${THEME_COOKIE}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;

/** Ce que le thème touche du document : le cookie et l'attribut de <html>. */
type ThemedDocument = { cookie: string; documentElement: { dataset: Record<string, string | undefined> } };

const listeners = new Set<() => void>();

/** Le thème affiché : l'attribut rendu par le serveur, ou celui posé par applyTheme. */
export const currentTheme = (doc: ThemedDocument = document) => resolveTheme(doc.documentElement.dataset.theme);

/** Navigateur : applique le thème tout de suite et le mémorise pour les prochaines pages. */
export function applyTheme(theme: Theme, doc: ThemedDocument = document) {
  doc.cookie = themeCookie(theme);
  doc.documentElement.dataset.theme = theme;
  for (const listener of listeners) listener();
}

/** Pour useSyncExternalStore : prévient à chaque changement de thème. */
export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
