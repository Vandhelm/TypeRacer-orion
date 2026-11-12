/**
 * La photo du joueur dans un rond. Tant qu'il n'en a pas choisi (AUTH-04), la tête du poisson d'O.R.I.O.N ;
 * décorative : le nom est déjà écrit à côté.
 */
export function ProfileAvatar({ name, src }: { name: string; src?: string | null }) {
  return (
    <span className="profile-avatar" aria-hidden="true">
      {src ? <img src={src} alt="" /> : <span className="avatar-default">{[...name][0]?.toUpperCase()}</span>}
    </span>
  );
}
