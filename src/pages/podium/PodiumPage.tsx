import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PodiumBoard } from "./PodiumBoard";
import { PodiumScene } from "./PodiumScene";
import { readResults, SAMPLE_RESULTS } from "./results";

/** After the race: the top three on the podium, then every player. */
export function PodiumPage() {
  const { t } = useTranslation();
  const [results] = useState(readResults);
  const players = results ?? SAMPLE_RESULTS;

  useEffect(() => {
    document.title = t("podium.pageTitle");
  }, [t]);

  return (
    <>
      <PodiumScene players={players} />
      <PodiumBoard players={players} showPlace={results !== null} />
    </>
  );
}
