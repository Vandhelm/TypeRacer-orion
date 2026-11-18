import type { Metadata } from "next";
import { LegacyPage } from "../../src/next/LegacyPage";
import "../../src/styles/pages/game/index.css";

export const metadata: Metadata = { title: "O.R.I.O.N — L'épreuve" };

export default function Page() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@700&display=swap" precedence="default" />
      <LegacyPage name="game" />
    </>
  );
}
