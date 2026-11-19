"use client";
import { LanguageSwitcher } from "../components/tabs/LanguageSwitcher";

export default function NotFoundSwitcher() {
  return <LanguageSwitcher className="hanging-tabs-floating" onChanged={() => location.reload()} />;
}
