import { titleFor } from "../../src/i18n/request";
import { LegacyPage } from "../../src/next/LegacyPage";
import "../../src/styles/pages/profile/index.css";

export const generateMetadata = titleFor("profile");

export default function Page() {
  return (
    <>
      <LegacyPage name="profile" />
    </>
  );
}
