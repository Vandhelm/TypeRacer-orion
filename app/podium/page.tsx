import { titleFor } from "../../src/i18n/request";
import { LegacyPage } from "../../src/next/LegacyPage";
import "../../src/styles/pages/podium/index.css";

export const generateMetadata = titleFor("podium");

export default function Page() {
  return (
    <>
      <LegacyPage name="podium" />
    </>
  );
}
