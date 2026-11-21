// Une couleur par place : celle du poisson et de la puce sur le billet. La place, pas le joueur, porte la couleur.
export const SEAT_COLORS = ["hsl(6, 71%, 58%)", "hsl(266, 85%, 59%)", "hsl(54, 100%, 74%)", "hsl(25, 100%, 63%)", "hsl(326, 47%, 47%)", "hsl(161, 65%, 60%)", "hsl(220, 85%, 65%)", "hsl(0, 0%, 72%)"] as const;

/** SALLE-05 : jusqu'à 30 places. Les 8 premières gardent leur couleur ; les suivantes tournent sur le cercle (angle d'or). */
export function seatColor(seat: number): string {
  return SEAT_COLORS[seat] ?? `hsl(${Math.round((seat * 137.508) % 360)}, 70%, ${seat % 2 ? 58 : 66}%)`;
}

/**
 * DES-05 : la couleur affichée d'une place, qui suit le thème (tokens --color-seat-N de src/styles/base/tokens.css).
 * Au-delà de 8, le thème par défaut garde le cercle de seatColor ; le thème cvd reprend ses huit couleurs sûres
 * (--seat-wrap-N), et le numéro de place (seatNumber) distingue deux joueurs de même couleur.
 */
export function seatFill(seat: number): string {
  return seat < SEAT_COLORS.length ? `var(--color-seat-${seat + 1})` : `var(--seat-wrap-${(seat % SEAT_COLORS.length) + 1}, ${seatColor(seat)})`;
}

/** La couleur reçue du serveur pour une place : celle qu'il attribue par place devient le token de la place. */
export function themedSeatColor(color: string | null, seat: number): string {
  return color === null || color === seatColor(seat) ? seatFill(seat) : color;
}

/** DES-05 : l'indice qui n'est pas une couleur, affiché à côté de la couleur de place (billet, bassin, piste). */
export const seatNumber = (index: number) => String(index + 1);
