import type { CSSProperties } from "react";
import { generatedAvatar } from "../../players/avatar";
import { seatFill } from "../../rooms/seats";

/**
 * La photo du joueur dans un rond. Sans photo (un invité n'en a jamais, AUTH-03 ; un compte qui n'en a pas choisi,
 * AUTH-04), un avatar généré à partir du nom : un poisson à sa teinte, penché à son angle, et son initiale.
 * A11Y-03 : décorative quand le nom est déjà écrit à côté (sans `label`) ; seule, `label` (le nom) la nomme.
 */
export function ProfileAvatar({ name, src, label }: { name: string; src?: string | null; label?: string }) {
  return (
    <span
      className="profile-avatar grid aspect-square w-[clamp(48px,7vh,64px)] flex-none place-items-center overflow-hidden rounded-[50%] border border-line bg-face-front-b font-sans text-[clamp(20px,3.2vh,28px)] leading-none font-light text-muted [box-shadow:inset_0_0_0_3px_#000,inset_0_0_0_4px_var(--color-line-faint)]"
      aria-hidden={label ? undefined : "true"}
    >
      {src ? <img className="size-full object-cover" src={src} alt={label ?? ""} /> : <GeneratedAvatar name={name} label={label} />}
    </span>
  );
}

/**
 * L'avatar généré : masqué aux lecteurs d'écran sans `label`, image nommée par `label` sinon (A11Y-03).
 * DES-05 : aucune couleur écrite ici. La teinte du nom (--avatar-hue) et une couleur sûre (--avatar-safe, l'une des
 * huit couleurs de place) passent en variables ; src/styles/base/tokens.css en tire le fond, le poisson et l'initiale :
 * la teinte du nom dans le thème par défaut, la couleur sûre dans le thème cvd. L'initiale reste l'indice principal.
 */
export function GeneratedAvatar({ name, label }: { name: string; label?: string }) {
  const { initial, hue, angle } = generatedAvatar(name);
  return (
    <svg
      className="generated-avatar block size-full"
      style={{ "--avatar-hue": hue, "--avatar-safe": seatFill(hue % 8) } as CSSProperties}
      viewBox="0 0 64 64"
      focusable="false"
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <rect className="fill-[var(--avatar-bg)]" width="64" height="64" />
      <g className="fill-[var(--avatar-fish)]" transform={`rotate(${angle} 32 32)`} opacity="0.45">
        <ellipse cx="28" cy="32" rx="20" ry="11" />
        <path d="M44 32 L60 21 L56 32 L60 43 Z" />
      </g>
      <text className="fill-[var(--avatar-ink)] font-sans text-[30px] font-light [line-height:normal]" x="32" y="33" textAnchor="middle" dominantBaseline="central">
        {initial}
      </text>
    </svg>
  );
}
