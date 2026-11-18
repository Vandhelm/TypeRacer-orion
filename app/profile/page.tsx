import type { Metadata } from "next";
import { LegacyPage } from "../../src/next/LegacyPage";
import "../../src/styles/pages/profile/index.css";

export const metadata: Metadata = { title: "O.R.I.O.N — Stats" };

export default function Page() {
  return (
    <>
      <LegacyPage name="profile" />
    </>
  );
}
