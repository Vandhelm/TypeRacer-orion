import { generatedAvatar } from "../../players/avatar";

/**
 * La photo du joueur dans un rond. Sans photo (un invité n'en a jamais, AUTH-03 ; un compte qui n'en a pas choisi,
 * AUTH-04), un avatar généré à partir du nom : un poisson à sa teinte, penché à son angle, et son initiale.
 * Décorative : le nom est déjà écrit à côté.
 */
export function ProfileAvatar({ name, src }: { name: string; src?: string | null }) {
  return (
    <span className="profile-avatar" aria-hidden="true">
      {src ? <img src={src} alt="" /> : <GeneratedAvatar name={name} />}
    </span>
  );
}

function GeneratedAvatar({ name }: { name: string }) {
  const { initial, hue, angle } = generatedAvatar(name);
  return (
    <svg className="avatar-generated" viewBox="0 0 64 64" focusable="false">
      <rect width="64" height="64" fill={`hsl(${hue}, 45%, 16%)`} />
      <g transform={`rotate(${angle} 32 32)`} fill={`hsl(${hue}, 70%, 58%)`} opacity="0.45">
        <ellipse cx="28" cy="32" rx="20" ry="11" />
        <path d="M44 32 L60 21 L56 32 L60 43 Z" />
      </g>
      <text x="32" y="33" textAnchor="middle" dominantBaseline="central" fill={`hsl(${hue}, 85%, 82%)`}>
        {initial}
      </text>
    </svg>
  );
}
