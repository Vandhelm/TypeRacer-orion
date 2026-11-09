import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { HangingButton } from "../../components/buttons/HangingButton";
import { readResults, SAMPLE_RESULTS } from "../podium/results";
import { ProfileDetails } from "./ProfileDetails";
import { SpeedChart } from "./SpeedChart";
import { StatBlock } from "./StatBlock";

const PODIUM_HREF = "podium.html#arrived";

function requestedIndex(count: number) {
  const index = Number(new URLSearchParams(location.search).get("player"));
  return Number.isInteger(index) && index >= 0 && index < count ? index : 0;
}

/** One player's statistics for the race that just ended. */
export function ProfilePage() {
  const { t } = useTranslation();
  const [{ players, summary }] = useState(() => readResults() ?? SAMPLE_RESULTS);
  const [index] = useState(() => requestedIndex(players.length));
  const player = players[index]!;

  useEffect(() => {
    document.title = t("profile.pageTitle", { name: player.name });
  }, [t, player.name]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") location.assign(PODIUM_HREF);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const place = t("profile.place", { rank: t(`podium.ranks.${index}`) });

  return (
    <main className="profile" aria-labelledby="profile-name">
      <header className="profile-head">
        <HangingButton className="profile-back" href={PODIUM_HREF}>{t("profile.back")}</HangingButton>
        <div className="profile-title">
          <h1 id="profile-name" className="profile-name">{player.name}</h1>
          <p className="profile-rank">{player.me ? `${place} · ${t("room.you")}` : place}</p>
        </div>
      </header>
      <div className="profile-top">
        <div className="profile-heroes">
          <StatBlock label={t("game.wpm")} value={String(player.wpm)} />
          <StatBlock label={t("profile.accuracy")} value={`${player.accuracy} %`} />
        </div>
        <SpeedChart player={player} />
      </div>
      <ProfileDetails player={player} summary={summary} />
    </main>
  );
}
