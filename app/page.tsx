import { titleFor } from "../src/i18n/request";
import { LegacyPage } from "../src/next/LegacyPage";
import "../src/styles/pages/home/index.css";

export const generateMetadata = titleFor("home");

export default function Page() {
  return (
    <>
      <LegacyPage name="home" />
    </>
  );
}
