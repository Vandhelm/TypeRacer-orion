// PERF-01 : sans carte graphique (rendu WebGL logiciel : SwiftShader, llvmpipe), la crème glacée 3D coûte des
// dizaines de millisecondes par image sur le fil principal. Le navigateur refuse alors le contexte WebGL et
// l'accueil dessine les assiettes en 2D, comme prévu par le dessin de secours.

export const ICE_CREAM_GL_OPTIONS = { alpha: true, antialias: true, failIfMajorPerformanceCaveat: true } as const;

/**
 * Which layer draws the plates and the ice cream this frame. gl : "ready" (3D plates built), "pending" (WebGL works,
 * plates still being built, one per task so that loading the page never blocks the main thread), "none" (no WebGL).
 */
export function plateLayer({ gl, counterShown }: { gl: "ready" | "pending" | "none"; counterShown: number }): "3d" | "2d" | "none" {
  if (counterShown <= 0 || gl === "pending") return "none";
  return gl === "ready" ? "3d" : "2d";
}

// Les boules qui fondent bougent lentement (une période de 10 s au moins) : déformer chacune à chaque image coûte
// cher (environ 2 800 sommets et leurs normales) sans rien changer à l'œil. Chacune est déformée une image sur
// RESHAPE_EVERY, à tour de rôle, soit 10 fois par seconde à 60 images par seconde.
export const RESHAPE_EVERY = 6;

export function reshapeThisFrame(index: number, frame: number): boolean {
  return (index + frame) % RESHAPE_EVERY === 0;
}

/** Whether a horizontal span [left, right] in CSS pixels (left null: behind the camera) crosses the viewport. */
export function spanOnScreen(left: number | null, right: number | null, width: number): boolean {
  if (left === null || right === null) return false;
  return right >= 0 && left <= width;
}
