// DES-05 : thème de la requête en cours (cookie du sélecteur), pour <html data-theme> dans app/layout.tsx.
import { cookies } from "next/headers";
import { resolveTheme, THEME_COOKIE } from "./theme";

export async function requestTheme() {
  return resolveTheme((await cookies()).get(THEME_COOKIE)?.value);
}
