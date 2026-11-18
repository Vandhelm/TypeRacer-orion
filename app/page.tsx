import type { Metadata } from "next";
import { LegacyPage } from "../src/next/LegacyPage";
import "../src/styles/pages/home/index.css";

export const metadata: Metadata = { title: "O.R.I.O.N — Accueil" };

export default function Page() {
  return (
    <>
      <LegacyPage name="home" />
    </>
  );
}
