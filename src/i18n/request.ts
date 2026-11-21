// I18N-02 : langue de la requête en cours (cookie du sélecteur, sinon Accept-Language), pour les composants serveur.
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { LANGUAGE_COOKIE, pageTitle, resolveLanguage, type TitledPage } from "./server";

export async function requestLanguage() {
  const [jar, list] = await Promise.all([cookies(), headers()]);
  return resolveLanguage(jar.get(LANGUAGE_COOKIE)?.value, list.get("accept-language"));
}

/** I18N-01 : le <title> d'une page, dans la langue de la requête. */
export const titleFor = (page: TitledPage) => async (): Promise<Metadata> => ({ title: pageTitle(await requestLanguage(), page) });
