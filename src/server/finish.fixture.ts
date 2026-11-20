// COURSE-06 : un membre n'arrive que si le serveur temps réel a validé 100 % de sa progression. Les tests qui font
// finir un coureur jouent ici ce que fait le temps réel (recordProgress), puis l'appel de la page (POST …/finish).
import type { Db } from "../../db/client";
import { recordProgress } from "./rooms";

type Call = (method: string, path: string, cookie?: string) => Promise<Response>;

/** Le coureur de ce cookie atteint 100 % validé par le serveur, puis sa page appelle /finish ; renvoie cette réponse. */
export async function finishAsServer(db: Db, call: Call, code: string, cookie: string): Promise<Response> {
  const read = await call("GET", `/api/rooms/${code}`, cookie);
  if (read.ok) {
    const { you } = (await read.json()) as { you: string };
    await recordProgress(db, code, you, 1);
  }
  return call("POST", `/api/rooms/${code}/finish`, cookie);
}
