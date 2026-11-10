/** The side of a 3D block: a polygon stretched over its box (styles: pages/podium/scene.css). */
export function SideFace({ points }: { points: string }) {
  return (
    <svg className="podium-side" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <polygon points={points} />
    </svg>
  );
}
