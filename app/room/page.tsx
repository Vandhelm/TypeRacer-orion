import type { Metadata } from "next";
import { LegacyPage } from "../../src/next/LegacyPage";
import "../../src/styles/pages/room/index.css";

export const metadata: Metadata = { title: "O.R.I.O.N — Le salon" };

export default function Page() {
  return (
    <>
      <LegacyPage name="room" />
    </>
  );
}
