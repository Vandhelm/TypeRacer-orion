import { useTranslation } from "react-i18next";

// BOT-04 : le même marqueur partout où un bot apparaît (salon, piste, podium, profil). À l'écran, la forme courte « BOT »
// en capitales, cadrée, qui tient dans un couloir de 8 ; pour un lecteur d'écran, un mot entier (« bot, joueur automatique »).
const TAG = "inline-block flex-none border border-line px-[.4em] font-mono leading-[1.2] font-normal tracking-[.08em] whitespace-nowrap text-muted";

export function BotTag({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <b data-part="bot" className={`${TAG} ${className}`.trim()}>
      {/* DES-05 : data-cue dessine une tête de robot devant BOT (styles/components/cues.css) */}
      <span aria-hidden="true" data-cue="bot">{t("room.bot")}</span>
      {/* entre parenthèses, précédé d'une espace : lu à part du nom qui le précède */}
      <span className="sr-only">{` (${t("room.botLabel")})`}</span>
    </b>
  );
}
