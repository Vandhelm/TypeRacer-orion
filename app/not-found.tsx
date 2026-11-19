import type { Metadata } from "next";
import { requestLanguage } from "../src/i18n/request";
import { notFoundText } from "../src/i18n/server";
import { NotFoundLanguage } from "../src/next/NotFoundLanguage";
import "../src/styles/pages/not-found/index.css";

// I18N-01 : la 404 (titre compris) suit la langue choisie (cookie), sinon celle du navigateur.
export async function generateMetadata(): Promise<Metadata> {
  return { title: `O.R.I.O.N — ${notFoundText(await requestLanguage()).title}` };
}

export default async function NotFound() {
  const text = notFoundText(await requestLanguage());
  return (
    <main className="grid min-h-screen place-items-center p-6 text-center font-mono [&_a]:[color:inherit] [&_a]:underline">
      <NotFoundLanguage />
      <div>
        <h1>{text.title}</h1>
        <p>{text.text}</p>
        <p><a href="/home">{text.home}</a></p>
      </div>
    </main>
  );
}
