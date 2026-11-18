import type { Metadata } from "next";
import { LegacyPage } from "../../src/next/LegacyPage";
import "../../src/styles/pages/podium/index.css";

export const metadata: Metadata = { title: "O.R.I.O.N — Le podium" };

export default function Page() {
  return (
    <>
      <LegacyPage name="podium" />
    </>
  );
}
