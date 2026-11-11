import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { HangingButton } from "../../components/buttons/HangingButton";
import { readResults, SAMPLE_RESULTS } from "../podium/results";
import { ProfileDetails } from "./ProfileDetails";
import { SpeedChart } from "./SpeedChart";
import { StatBlock } from "./StatBlock";

const PODIUM_HREF = "/podium#arrived";

/** Le podium ouvre la page avec ?player=N pour montrer un joueur ; sans ce paramètre, c'est mon profil, une page à part. */
function requestedIndex(players: { me: boolean }[]) {
  const param = new URLSearchParams(location.search).get("player");
  if (param === null) return { index: Math.max(0, players.findIndex((player) => player.me)), fromPodium: false };
  const index = Number(param);
  return { index: Number.isInteger(index) && index >= 0 && index < players.length ? index : 0, fromPodium: true };
}

/** One player's statistics for the race that just ended. */
export function ProfilePage() {
  const { t } = useTranslation();
  const [{ players, summary }] = useState(() => readResults() ?? SAMPLE_RESULTS);
  const [{ index, fromPodium }] = useState(() => requestedIndex(players));
  const player = players[index]!;

  useEffect(() => {
    document.title = t("profile.pageTitle", { name: player.name });
  }, [t, player.name]);

  useEffect(() => {
    if (!fromPodium) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") location.assign(PODIUM_HREF);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [fromPodium]);

  const place = t("profile.place", { rank: t(`podium.ranks.${index}`) });

  return (
    <main className="profile" aria-labelledby="profile-name">
      <header className="profile-head">
        {fromPodium && <HangingButton className="profile-back" href={PODIUM_HREF}>{t("profile.back")}</HangingButton>}
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
