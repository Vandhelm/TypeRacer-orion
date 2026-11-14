import { useMemo } from "react";
import { encode } from "uqr";

/** QUIET_ZONE : la marge claire (en modules) dont les lecteurs ont besoin autour du code. */
export const QUIET_ZONE = 4;

/** La matrice du QR code en un seul tracé SVG, un carré par module sombre. size inclut la marge. */
export function qrPath(value: string) {
  const { data, size } = encode(value, { ecc: "M", border: QUIET_ZONE });
  let path = "";
  data.forEach((row, y) => row.forEach((dark, x) => { if (dark) path += `M${x} ${y}h1v1h-1z`; }));
  return { size, path };
}

/** QR code drawn in SVG: dark modules on a light square, whatever the page theme. */
export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const { size, path } = useMemo(() => qrPath(value), [value]);
  return (
    <svg className={className} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
