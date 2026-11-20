// Décor de la page d'accueil : comptoir de sushi dessiné sur trois canvas
// (2D derrière, WebGL pour la crème glacée, 2D devant).
// createScene démarre le rendu et renvoie de quoi piloter le comptoir et le tapis,
// ainsi que destroy() pour tout arrêter (appelé quand le composant React est démonté).
// PERF-01 : Three.js (plus de 600 Ko) est chargé à part, seulement quand la couche 3D se prépare
import type * as THREE from 'three';
import fishSheetImage from '../../../assets/home/fish-sheet.webp';
import { hardwareWebGL, ICE_CREAM_GL_OPTIONS, plateLayer, reshapeThisFrame, spanOnScreen } from './scene-quality';

export type View = 'home' | 'rooms';

export type SceneApi = {
    /** Shows (1) or hides (0) the counter over `ms` milliseconds. */
    setCounter(level: number, ms: number): void;
    /** The belt speeds up to the right. */
    beltLeave(ms: number, onStep?: ((k: number) => void) | null, onDone?: (() => void) | null): void;
    /** The belt arrives already moving (dist < 0: to the left) and slows back to its pace. */
    beltArrive(dist: number, ms: number, onStep?: ((k: number) => void) | null, onDone?: (() => void) | null): void;
    setIceCreamOpacity(opacity: number | string): void;
    beltSpeed: number;
    beltAcceleration: number;
    destroy(): void;
};

type V3 = [number, number, number];
type Pt2 = [number, number];
type Quad = [V3, V3, V3, V3];
type Box = { x: number; y: number; z: number; w: number; h: number; d: number };
type BoxColors = { front: [string, string]; side: string; cap: string; edge?: string };
type LayoutItem = [number, number, number, number?, number?];
type Flavor2d = { fill: string; tone: string; spark: string; pud: string };

const context2d = (canvas: HTMLCanvasElement): CanvasRenderingContext2D => {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    return ctx;
};
// sous Next.js une image importée est un objet { src } ; sous Bun (tests), un chemin
const assetUrl = (image: string | { src: string }): string => (typeof image === 'string' ? image : image.src);
const allVisible = (pts: (V3 | null)[]): pts is V3[] => pts.every(p => p !== null);

export function createScene(
    canvases: { decor: HTMLCanvasElement; iceCream: HTMLCanvasElement; front: HTMLCanvasElement },
    { initialView }: { initialView: View },
): SceneApi {
    let stopped = false;
    const raf = (cb: (now: number) => void) => (stopped ? 0 : requestAnimationFrame(now => { if (!stopped) cb(now); }));

    // ================= Décor : comptoir de sushi en formes géométriques =================
    // Tout est placé dans un espace 3D (x à droite, y en haut, z vers le fond)
    // et projeté depuis la caméra : on est assis au comptoir, un tapis roulant
    // passe devant avec des assiettes, un noren pend en haut, des lanternes
    // rouges sont suspendues et des cloisons shoji bordent la salle.
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canvas = canvases.decor;
    let ctx = context2d(canvas);
    const ctxBack = ctx;
    // couche de premier plan (couverts du comptoir), au-dessus de la crème glacée 3D
    const canvasFront = canvases.front;
    const ctxFront = context2d(canvasFront);

    const line = (a: number) => `rgba(255,255,255,${a})`;
    const RED = '#9e1f17', RED_HI = '#c0342a', RED_LO = '#5c120d';
    const DARK: BoxColors = { front: ['#070707', '#151515'], side: '#2a2a2a', cap: '#1d1d1d' };
    const RICE = { front: ['#cfccc5', '#ebe8e2'], side: '#bdb9b1', cap: '#f3f1ec', edge: 'rgba(0,0,0,.45)' };
    const FISH = { front: ['#a3221a', '#c0342a'], side: '#7a1812', cap: '#c94535', edge: 'rgba(255,200,190,.35)' };

    // Salle
    const ROOM = { x: 14, top: 7.6, z: 30 };
    const COUNTER_TOP = -2.4;

    // ---------- Caméra et projection ----------
    const cam = { x: 0, y: 0, z: 0 };
    let W = 0, H = 0, F = 0, CX = 0, CY = 0, DPR = 1;
    function resize(){
        const dpr = DPR = Math.min(window.devicePixelRatio || 1, 2);
        W = innerWidth; H = innerHeight;
        canvas.width = W * dpr; canvas.height = H * dpr;
        ctxBack.setTransform(dpr, 0, 0, dpr, 0, 0);
        canvasFront.width = W * dpr; canvasFront.height = H * dpr;
        ctxFront.setTransform(dpr, 0, 0, dpr, 0, 0);
        F = Math.max(Math.min(W * .62, H * 1.05), Math.min(H * .7, W * 1.6));   // focale (plus serrée sur téléphone)
        CX = W / 2; CY = H / 2;
        if (typeof ICE_CREAM !== 'undefined' && ICE_CREAM) ICE_CREAM.resize();
    }
    const NEAR = .3;
    function P(x: number, y: number, z: number): V3 | null {
        const dz = z - cam.z;
        if (dz < NEAR) return null;
        return [CX + F * (x - cam.x) / dz, CY - F * (y - cam.y) / dz, dz];
    }
    function path(pts: readonly (readonly number[])[]){
        ctx.beginPath();
        ctx.moveTo(pts[0]![0]!, pts[0]![1]!);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0]!, pts[i]![1]!);
        ctx.closePath();
    }
    function poly(pts3: V3[], fill?: string | CanvasGradient | null, stroke?: string | null, lw = 1){
        const pts = pts3.map(p => P(...p));
        if (!allVisible(pts)) return;
        path(pts);
        if (fill){ ctx.fillStyle = fill; ctx.fill(); }
        if (stroke){ ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
    }
    function seg(a: V3, b: V3, stroke: string, lw = 1){
        let [x1, y1, z1] = a, [x2, y2, z2] = b;
        const n = cam.z + NEAR * 1.01;
        if (z1 < n && z2 < n) return;
        if (z1 < n){ const t = (n - z1) / (z2 - z1); x1 += (x2 - x1) * t; y1 += (y2 - y1) * t; z1 = n; }
        if (z2 < n){ const t = (n - z2) / (z1 - z2); x2 += (x1 - x2) * t; y2 += (y1 - y2) * t; z2 = n; }
        const p = P(x1, y1, z1)!, q = P(x2, y2, z2)!;
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
        ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke();
    }
    const fade = (z: number) => Math.max(0, Math.min(1, 1 - (z - cam.z) / (ROOM.z + 6 - cam.z)));

    // ---------- Bloc opaque : seulement les faces tournées vers la caméra ----------
    function box(b: Box, col: BoxColors = DARK){
        const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2;
        const y0 = b.y - b.h / 2, y1 = b.y + b.h / 2;
        const z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
        if (z1 - cam.z < NEAR) return;
        const edge = col.edge || line(.25 + .4 * fade(b.z));
        if (cam.x > x1) poly([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], col.side, edge);
        if (cam.x < x0) poly([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], col.side, edge);
        if (cam.y > y1) poly([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], col.cap, edge);
        if (cam.y < y0) poly([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], col.cap, edge);
        if (z0 - cam.z > NEAR){
            const a = P(x0, y1, z0)!, c = P(x1, y0, z0)!;
            const g = ctx.createLinearGradient(a[0], 0, c[0], 0);
            g.addColorStop(0, col.front[0]); g.addColorStop(1, col.front[1]);
            poly([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], g, col.edge || line(.35 + .45 * fade(b.z)));
        }
    }

    // cercle horizontal (plan y) projeté
    function ring(x: number, y: number, z: number, r: number, n = 40){
        return Array.from({ length: n }, (_, i) => {
            const a = i / n * Math.PI * 2;
            return P(x + r * Math.cos(a), y, z + r * Math.sin(a));
        });
    }
    function hull(pts: V3[]){
        pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        const cr = (o: V3, a: V3, b: V3) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
        const lo: V3[] = [], up: V3[] = [];
        for (const p of pts){ while (lo.length >= 2 && cr(lo[lo.length - 2]!, lo[lo.length - 1]!, p) <= 0) lo.pop(); lo.push(p); }
        for (const p of pts.reverse()){ while (up.length >= 2 && cr(up[up.length - 2]!, up[up.length - 1]!, p) <= 0) up.pop(); up.push(p); }
        return lo.slice(0, -1).concat(up.slice(0, -1));
    }
    // cylindre debout (axe vertical)
    function cylinder(x: number, y0: number, y1: number, z: number, r: number, sideFill: string, topFill: string, stroke: string){
        const b = ring(x, y0, z, r), t = ring(x, y1, z, r);
        if (!allVisible(b) || !allVisible(t)) return null;
        path(hull(b.concat(t)));
        ctx.fillStyle = sideFill; ctx.fill();
        ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke();
        path(t);
        ctx.fillStyle = topFill; ctx.fill(); ctx.stroke();
        return t;
    }

    // ---------- Salle : murs shoji, plafond, fond ----------
    function drawRoom(){
        const { x: X, top: T, z: Z } = ROOM, B = COUNTER_TOP;
        // fond
        poly([[-X, B, Z], [X, B, Z], [X, T, Z], [-X, T, Z]], '#050505', line(.3));
        // lattes verticales du mur du fond
        for (let x = -X + 1.4; x < X; x += 1.4) seg([x, B, Z], [x, T, Z], line(.07));
        // arêtes de la salle
        for (const [x, y] of [[-X, B], [X, B], [-X, T], [X, T]] as Pt2[]) seg([x, y, cam.z], [x, y, Z], line(.4));
        // cloisons shoji sur les murs latéraux : montants et traverses
        for (const sx of [-X, X]){
            for (let z = Math.ceil(cam.z / SHOJI.dz) * SHOJI.dz + SHOJI.dz; z <= Z; z += SHOJI.dz){
                seg([sx, B, z], [sx, T, z], line(.12 + .25 * fade(z)));
            }
            for (let y = B + SHOJI.dy; y < T; y += SHOJI.dy) seg([sx, y, cam.z], [sx, y, Z], line(.1));
        }
        // sol en tatamis derrière le comptoir : rectangles 2 × 1, en alternance
        const zf0 = counter.z + counter.d / 2, TW = 2.4, TD = 1.2;
        for (let z = zf0; z < Z - .01; z += TD * 2){
            seg([-X, B, z], [X, B, z], line(.16));
            seg([-X, B, z + TD], [X, B, z + TD], line(.1));
            const row = Math.round((z - zf0) / (TD * 2));
            for (let x = -X + (row % 2 ? TW / 2 : 0); x < X; x += TW){
                seg([x, B, z], [x, B, z + TD * 2], line(.12));
            }
        }
        // plafond : lignes longitudinales
        for (let x = -X + 2.8; x < X; x += 2.8) seg([x, T, cam.z], [x, T, Z], line(.06));
    }

    // ---------- Têtes de poisson : animation en planche d'images ----------
    const FISH_FRAMES = 9, FISH_DUR = [140, 140, 140, 140, 280, 140, 140, 140, 140];
    const FISH_TOTAL = FISH_DUR.reduce((a, b) => a + b, 0);
    let fishTiles: HTMLCanvasElement[] | null = null;                       // une image par étape, avec liseré blanc
    const sheet = new Image();
    sheet.onload = () => {
        const fw = sheet.width / FISH_FRAMES, fh = sheet.height, pad = 4;
        fishTiles = Array.from({ length: FISH_FRAMES }, (_, i) => {
            // silhouette blanche pour le liseré
            const sil = document.createElement('canvas');
            sil.width = fw; sil.height = fh;
            const s = context2d(sil);
            s.drawImage(sheet, i * fw, 0, fw, fh, 0, 0, fw, fh);
            s.globalCompositeOperation = 'source-in';
            s.fillStyle = '#fff'; s.fillRect(0, 0, fw, fh);

            const t = document.createElement('canvas');
            t.width = fw + pad * 2; t.height = fh + pad * 2;
            const c = context2d(t);
            c.translate(0, t.height); c.scale(1, -1);           // tête retournée, comme sur la maquette
            for (let a = 0; a < 8; a++){
                const r = a % 2 ? 1.6 : 2.2;
                c.drawImage(sil, pad + Math.cos(a * Math.PI / 4) * r, pad + Math.sin(a * Math.PI / 4) * r);
            }
            c.drawImage(sheet, i * fw, 0, fw, fh, pad, pad, fw, fh);
            return t;
        });
        if (reduce) render(0);
    };
    sheet.src = assetUrl(fishSheetImage);   // PERF-01 : une image à part, plus du base64 dans le JS

    function fishTile(ms: number){
        if (!fishTiles) return null;
        let t = (reduce ? 0 : ms) % FISH_TOTAL, i = 0;
        while (t >= FISH_DUR[i]!){ t -= FISH_DUR[i]!; i++; }
        return fishTiles[i]!;
    }

    const L3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const Q3 = (q: Quad, u: number, v: number) => L3(L3(q[0], q[1], u), L3(q[3], q[2], u), v);   // point (u, v) d'une face

    // Plaque une image sur une face en perspective, en fines bandes (correct en profondeur)
    function texQuad(tex: HTMLCanvasElement, q: Quad, strips: number){
        const TW = tex.width, TH = tex.height;
        for (let i = 0; i < strips; i++){
            const u0 = i / strips, u1 = (i + 1) / strips;
            const a = P(...Q3(q, u0, 0)), b = P(...Q3(q, u1, 0)), c = P(...Q3(q, u0, 1));
            if (!a || !b || !c) continue;
            const sx = u0 * TW, sw = (u1 - u0) * TW;
            const k = strips > 1 ? 1.04 : 1;    // léger recouvrement pour éviter les joints
            ctx.setTransform(
                DPR * (b[0] - a[0]) / sw, DPR * (b[1] - a[1]) / sw,
                DPR * (c[0] - a[0]) / TH, DPR * (c[1] - a[1]) / TH,
                DPR * a[0], DPR * a[1]);
            ctx.drawImage(tex, sx, 0, Math.min(sw * k, TW - sx), TH, 0, 0, Math.min(sw * k, TW - sx), TH);
        }
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }

    // Tête de poisson sur une face (4 coins 3D, lenU × lenV en unités du monde).
    // Son orientation dépend de l'endroit où se trouve la face : la tête pivote
    // sur sa face pour regarder vers le centre de l'écran (le panneau), et reste
    // à l'endroit, l'œil vers le haut.
    function drawFish(face: Quad, lenU: number, lenV: number, perspective: boolean, ms: number){
        const tex = fishTile(ms);
        if (!tex) return;
        if (face.some(v => !P(...v))) return;
        const a = P(...face[0])!, c = P(...face[2])!;
        if (Math.hypot(c[0] - a[0], c[1] - a[1]) < 28) return;   // trop petit à l'écran

        // point local (s, t) de la face, mesuré depuis son centre en unités du monde
        const pt = (s: number, t: number) => Q3(face, .5 + s / lenU, .5 + t / lenV);
        const m = P(...pt(0, 0));
        if (!m) return;

        // comment un pas sur la face se traduit à l'écran
        const e = .05;
        const ps = P(...pt(e, 0)), pt_ = P(...pt(0, e));
        if (!ps || !pt_) return;
        const Ds: Pt2 = [(ps[0] - m[0]) / e, (ps[1] - m[1]) / e];
        const Dt: Pt2 = [(pt_[0] - m[0]) / e, (pt_[1] - m[1]) / e];

        // direction écran vers le centre, ramenée dans le plan de la face
        let dx = CX - m[0], dy = CY - m[1];
        if (Math.hypot(dx, dy) < 1){ dx = 1; dy = 0; }
        const det = Ds[0] * Dt[1] - Dt[0] * Ds[1];
        if (Math.abs(det) < 1e-6) return;
        let hs = ( dx * Dt[1] - dy * Dt[0]) / det;
        let ht = (-dx * Ds[1] + dy * Ds[0]) / det;
        const n = Math.hypot(hs, ht); hs /= n; ht /= n;          // sens de la tête

        // "bas" de l'image : perpendiculaire, choisi pour que l'œil reste en haut à l'écran
        let ds = -ht, dt = hs;
        if (Ds[1] * ds + Dt[1] * dt < 0){ ds = -ds; dt = -dt; }

        // taille maximale qui tient dans la face, quel que soit l'angle
        const ratio = tex.width / tex.height;
        const fh = Math.min(
            .86 * lenU / (ratio * Math.abs(hs) + Math.abs(ds)),
            .86 * lenV / (ratio * Math.abs(ht) + Math.abs(dt)));
        const fw = fh * ratio;

        let s0 = -hs * fw / 2 - ds * fh / 2, t0 = -ht * fw / 2 - dt * fh / 2;
        const loc: Pt2[] = [[s0, t0], [s0 + hs * fw, t0 + ht * fw], [s0 + hs * fw + ds * fh, t0 + ht * fw + dt * fh], [s0 + ds * fh, t0 + dt * fh]];

        // l'image est coupée net à l'arrière de la tête : on recule la tête jusqu'à
        // ce que ce bord passe derrière l'arête de la face, où il est masqué
        let k = Infinity;
        for (const [cs, ct] of loc){
            if (hs >  1e-6) k = Math.min(k, (cs + lenU / 2) / hs);
            if (hs < -1e-6) k = Math.min(k, (lenU / 2 - cs) / -hs);
            if (ht >  1e-6) k = Math.min(k, (ct + lenV / 2) / ht);
            if (ht < -1e-6) k = Math.min(k, (lenV / 2 - ct) / -ht);
        }
        const back = (isFinite(k) ? k : 0) + fw * .12;
        const sub = loc.map(([cs, ct]) => pt(cs - hs * back, ct - ht * back)) as Quad;

        ctx.save();
        ctx.beginPath();
        const fq = face.map(v => P(...v)) as V3[];
        ctx.moveTo(fq[0]![0], fq[0]![1]);
        for (let i = 1; i < 4; i++) ctx.lineTo(fq[i]![0], fq[i]![1]);
        ctx.closePath();
        ctx.clip();
        texQuad(tex, sub, perspective ? 14 : 1);
        ctx.restore();
    }

    // ---------- Têtes de poisson dans certaines cases des cloisons shoji ----------
    const SHOJI = { dz: 2.4, dy: 1.6 };
    // une case sur quatre environ, choisie une fois pour toutes, en quinconce
    const fishCells: { side: number; z0: number; y0: number }[] = [];
    for (const side of [-1, 1]){
        for (let k = 3; (k + 1) * SHOJI.dz <= ROOM.z; k++){
            for (let r = 0; r < 6; r++){
                const y0 = COUNTER_TOP + r * SHOJI.dy;
                if (y0 + SHOJI.dy > ROOM.top) continue;
                if ((k * 3 + r * 5 + (side > 0 ? 2 : 0)) % 4 === 0) fishCells.push({ side, z0: k * SHOJI.dz, y0 });
            }
        }
    }
    function drawFishCells(ms: number){
        for (const c of fishCells.slice().sort((a, b) => b.z0 - a.z0)){
            const x = c.side * ROOM.x, z0 = c.z0, z1 = z0 + SHOJI.dz, y0 = c.y0, y1 = y0 + SHOJI.dy;
            if (z0 - cam.z < 1) continue;
            const face: Quad = [[x, y1, z0], [x, y1, z1], [x, y0, z1], [x, y0, z0]];
            ctx.globalAlpha = .55 + .45 * fade(z0);
            poly(face, '#0c0c0c', line(.35));                 // la case, un peu plus sombre
            drawFish(face, SHOJI.dz, SHOJI.dy, true, ms);
            ctx.globalAlpha = 1;
        }
    }

    // poutres du plafond
    const beams = [9, 15, 21, 27].map(z => ({ x: 0, y: ROOM.top - .3, z, w: ROOM.x * 2, h: .6, d: .6 }));

    // ---------- Noren : rideau à panneaux avec emblème rouge ----------
    const NOREN = { z: 14, top: 7.0, bottom: 3.7, x0: -12, x1: 12, n: 6, gap: .16 };
    function drawNoren(t: number){
        const { z, top, bottom, x0, x1, n, gap } = NOREN;
        box({ x: 0, y: top + .08, z: z - .1, w: x1 - x0 + 1, h: .16, d: .16 });           // tringle
        const pw = (x1 - x0) / n;
        for (let i = 0; i < n; i++){
            const a = x0 + i * pw + gap / 2, b = x0 + (i + 1) * pw - gap / 2;
            const sway = reduce ? 0 : Math.sin(t * .9 + i * .8) * .12;            // le bas ondule à peine
            const pts: Quad = [[a, top, z], [b, top, z], [b + sway, bottom, z + Math.abs(sway) * .5], [a + sway, bottom, z + Math.abs(sway) * .5]];
            const p0 = P(...pts[0]), p3 = P(...pts[3]);
            if (!p0 || !p3) continue;
            const g = ctx.createLinearGradient(0, p0[1], 0, p3[1]);
            g.addColorStop(0, '#141414'); g.addColorStop(1, '#0a0a0a');
            poly(pts, g, line(.6));
        }
        // emblème : disque rouge à cheval sur les deux panneaux du milieu
        const c = P(0, (top + bottom) / 2 + .15, z - .02);
        if (c){
            const r = F * 1.15 / c[2];
            ctx.save();
            ctx.beginPath();
            const half = F * (gap / 2) / c[2];
            ctx.rect(0, 0, c[0] - half, H); ctx.rect(c[0] + half, 0, W, H);   // garde la fente du noren
            ctx.clip();
            ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, Math.PI * 2);
            ctx.fillStyle = RED; ctx.fill();
            ctx.strokeStyle = 'rgba(255,140,120,.35)'; ctx.lineWidth = 1; ctx.stroke();
            ctx.beginPath(); ctx.arc(c[0], c[1], r * 1.22, 0, Math.PI * 2);
            ctx.strokeStyle = line(.55); ctx.stroke();
            ctx.restore();
        }
    }

    // ---------- Lanternes rouges (chōchin) ----------
    const lanterns = [
        { x: -9.2, y: 2.4, z: 12, r: 1.0, h: 1.35, ph: 0 },
        { x:  9.2, y: 2.4, z: 12, r: 1.0, h: 1.35, ph: 1.7 },
        { x: -11.4, y: 3.4, z: 21, r: .9, h: 1.2, ph: .6 },
        { x:  11.4, y: 3.4, z: 21, r: .9, h: 1.2, ph: 2.4 },
    ];
    function drawLantern(L: (typeof lanterns)[number], t: number){
        const top = P(L.x, ROOM.top, L.z), c = P(L.x, L.y, L.z);
        if (!top || !c) return;
        const rx = F * L.r / c[2], ry = F * L.h / c[2];
        const ang = reduce ? 0 : Math.sin(t * .7 + L.ph) * .04;
        ctx.save();
        ctx.translate(top[0], top[1]); ctx.rotate(ang); ctx.translate(-top[0], -top[1]);
        // cordon
        ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.lineTo(c[0], c[1] - ry * 1.12);
        ctx.strokeStyle = line(.5); ctx.lineWidth = 1; ctx.stroke();
        // corps
        ctx.beginPath(); ctx.ellipse(c[0], c[1], rx, ry, 0, 0, Math.PI * 2);
        const g = ctx.createRadialGradient(c[0] - rx * .3, c[1] - ry * .2, rx * .1, c[0], c[1], rx * 1.1);
        g.addColorStop(0, RED_HI); g.addColorStop(.7, RED); g.addColorStop(1, RED_LO);
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = 'rgba(255,170,150,.45)'; ctx.stroke();
        // nervures horizontales
        ctx.strokeStyle = 'rgba(0,0,0,.35)';
        for (let k = -4; k <= 4; k++){
            const dy = k / 5 * ry, w = rx * Math.sqrt(1 - (dy / ry) ** 2);
            ctx.beginPath(); ctx.ellipse(c[0], c[1] + dy, w, Math.max(1, rx * .12), 0, 0, Math.PI); ctx.stroke();
        }
        // bandeau vertical blanc
        ctx.beginPath(); ctx.moveTo(c[0], c[1] - ry * .55); ctx.lineTo(c[0], c[1] + ry * .55);
        ctx.strokeStyle = line(.55); ctx.lineWidth = Math.max(1, rx * .06); ctx.stroke();
        // embouts noirs
        ctx.lineWidth = 1;
        for (const s of [-1, 1]){
            const cw = rx * .62, ch = Math.max(3, ry * .12);
            const y = s < 0 ? c[1] - ry * .98 - ch : c[1] + ry * .98;
            ctx.fillStyle = '#0a0a0a'; ctx.fillRect(c[0] - cw / 2, y, cw, ch);
            ctx.strokeStyle = line(.6); ctx.strokeRect(c[0] - cw / 2, y, cw, ch);
        }
        ctx.restore();
    }

    // ---------- Comptoir et tapis roulant ----------
    const counter = { x: 0, y: COUNTER_TOP - 2, z: 8.5, w: 60, h: 4, d: 5 };
    const BELT = { y: COUNTER_TOP + .08, z0: 7.4, z1: 9.0, speed: .9 };
    function drawCounter(t: number){
        box(counter, { front: ['#0b0b0b', '#121212'], side: '#222', cap: '#161616' });
        // filet rouge sur l'arête avant (laque)
        const zf = counter.z - counter.d / 2;
        seg([-30, COUNTER_TOP, zf], [30, COUNTER_TOP, zf], 'rgba(192,52,42,.9)', 2);
        // tapis
        box({ x: 0, y: BELT.y, z: (BELT.z0 + BELT.z1) / 2, w: 60, h: .16, d: BELT.z1 - BELT.z0 },
            { front: ['#0e0e0e', '#161616'], side: '#262626', cap: '#101010' });
        const yt = BELT.y + .08, step = .7, off = reduce ? 0 : (beltPos(t) + BELT_OFFSET) % step;
        for (let x = -16 + off; x < 16; x += step) seg([x, yt, BELT.z0], [x, yt, BELT.z1], line(.13));
        seg([-30, yt, BELT.z0], [30, yt, BELT.z0], line(.5));
        seg([-30, yt, BELT.z1], [30, yt, BELT.z1], line(.35));
    }

    // ---------- Assiettes ----------
    function plate(x: number, z: number, red: boolean){
        const y = BELT.y + .1;
        const out = ring(x, y, z, .78), inn = ring(x, y + .001, z, .56);
        if (!allVisible(out)) return y;
        path(out); ctx.fillStyle = '#101010'; ctx.fill();
        ctx.strokeStyle = red ? 'rgba(210,60,48,.95)' : line(.75); ctx.lineWidth = red ? 2 : 1; ctx.stroke();
        path(inn as V3[]); ctx.strokeStyle = line(.2); ctx.lineWidth = 1; ctx.stroke();
        return y;
    }
    // ---------- Boules de crème glacée, dessin façon manga ----------
    // D'après la vidéo : forme bosselée dessinée à la main, plus large que haute,
    // quelques coulures irrégulières, trame de points le long des bords,
    // petits reflets en étoile, contour noir ; les boules s'empilent en se
    // recouvrant (les coulures de la boule du dessus passent sur celle du dessous).
    const FLAVORS: Flavor2d[] = [
        { fill: '#8b3cf0', tone: 'rgba(60,10,140,.45)',  spark: '#d8c2ff', pud: '#6a22c9' },   // violet
        { fill: '#a8357a', tone: 'rgba(80,10,50,.45)',   spark: '#f3b9dc', pud: '#82235c' },   // prune
        { fill: '#fff07a', tone: 'rgba(170,140,20,.42)', spark: '#ffffff', pud: '#e8cf3c' },   // citron
        { fill: '#ff8a3a', tone: 'rgba(160,60,0,.5)',    spark: '#ffe0c8', pud: '#e0661a' },   // orange
    ];
    const SCOOP_W = 1.0;          // largeur d'une boule (unités du monde)

    // pseudo-hasard stable
    const hash = (n: number) => { const r = Math.sin(n * 12.9898) * 43758.5453; return r - Math.floor(r); };

    // contour d'une boule en coordonnées normalisées (x de -0,5 à 0,5, y vers le haut, 0 = bas du bord)
    // ---------- Forme de chaque boule ----------
    // Chaque boule a sa propre forme, tirée de son numéro : largeur, hauteur,
    // inclinaison et bosses changent. Trois sortes :
    //   ferme   : dôme et bord ondulé tiré à la cuillère
    //   molle   : plus ronde et bosselée, bord irrégulier
    //   fondue  : affaissée et élargie ; posée sur une autre boule, elle coule
    //             par-dessus (coulures qui s'allongent et se rétractent) ;
    //             posée sur l'assiette, elle s'étale en flaque
    function scoopParams(seed: number){
        const r = (k: number) => hash(seed * 1.7 + k);
        const kind = r(1) < .38 ? 'fondue' : r(1) < .68 ? 'molle' : 'ferme';
        const harm = Array.from({ length: 6 }, (_, k) => ({ a: (.035 - k * .004) * (.5 + r(10 + k)), p: r(20 + k) * 6.28 }));
        return {
            kind,
            rx: .47 + r(2) * .07 + (kind === 'fondue' ? .04 : 0),
            ry: (kind === 'fondue' ? .3 : kind === 'molle' ? .4 : .38) + r(3) * .07,
            tilt: (r(4) - .5) * .05,
            harm,
            waves: 3 + Math.floor(r(5) * 4),
            waveAmp: .025 + r(6) * .035,
            drips: Array.from({ length: 1 + Math.floor(r(7) * 3) }, (_, k) => ({
                x: -.34 + (k + .2 + r(30 + k) * .6) / (1 + Math.floor(r(7) * 3)) * .68,
                w: .045 + r(40 + k) * .06,
                l: .04 + r(50 + k) * r(55 + k) * .16,
                sp: .25 + r(60 + k) * .35, ph: r(70 + k) * 6.28,
            })),
            sagPh: r(80) * 6.28,
        };
    }
    // contour à l'instant t (seules les boules fondues bougent)
    function makeScoopShape(P_: ReturnType<typeof scoopParams>, t: number, stacked: boolean){
        const bumps = (a: number) => 1 + P_.harm.reduce((s, h, k) => s + h.a * Math.sin((k + 2) * a + h.p), 0);
        const melt = P_.kind === 'fondue';
        const sag = melt && !reduce ? 1 - .05 * (.5 + .5 * Math.sin(t * .35 + P_.sagPh)) : 1;
        const ry = P_.ry * sag, rx = P_.rx * (melt ? 1 + (1 - sag) * .6 : 1);
        const s0 = melt ? .55 : P_.kind === 'molle' ? .5 : .32;     // jusqu'où le dôme descend
        const base = .1 + (melt ? 0 : .02);
        const cy = base + ry * Math.sin(s0);
        const outline: Pt2[] = [], inner: Pt2[] = [];

        for (let k = 0; k <= 72; k++){
            const a = Math.PI + s0 - (Math.PI + 2 * s0) * k / 72;
            const b = bumps(a), up = Math.max(0, Math.sin(a));
            outline.push([rx * Math.cos(a) * b + P_.tilt * up, cy + ry * Math.sin(a) * b]);
        }
        const R = outline[outline.length - 1]!, L = outline[0]!;

        // bas de la boule, de droite à gauche
        const flare = melt ? .07 : P_.kind === 'ferme' ? .04 : .015;
        const right = R[0] + flare, left = L[0] - flare;
        outline.push([right, base * .8]);
        const n = P_.waves;
        for (let x = right - .01; x >= left + .01; x -= .006){
            const u = (x - left) / (right - left), f = (u * n) % 1;
            let y: number;
            if (P_.kind === 'ferme') y = P_.waveAmp * (1 - Math.sin(Math.PI * f));
            else y = .025 + .02 * Math.sin(u * 9 + P_.sagPh) + .012 * Math.sin(u * 23 + P_.harm[0]!.p);
            if (melt && stacked){
                // coulures qui s'allongent et se rétractent doucement, au bout arrondi
                for (const d of P_.drips){
                    const len = d.l * (reduce ? .8 : .55 + .45 * (.5 + .5 * Math.sin(t * d.sp + d.ph)));
                    const v = (x - d.x) / d.w;
                    if (Math.abs(v) < 1.25){
                        const body = Math.abs(v) < 1 ? Math.sqrt(1 - v * v) : 0;
                        const bulb = Math.max(0, 1 - Math.pow(v / 1.25, 2)) * .25;     // goutte un peu renflée au bout
                        y -= len * Math.min(1, body + bulb * (len / .2));
                    }
                }
            }
            outline.push([x, y]);
        }
        outline.push([left, base * .8]);

        // ligne du bord, seulement sur les boules fermes
        if (P_.kind === 'ferme'){
            const IW = (right - left) * .41, cxm = (right + left) / 2;
            for (let x = cxm - IW; x <= cxm + IW + 1e-6; x += .006){
                const u = (x - left) / (right - left), f = (u * n) % 1;
                inner.push([x, base + .07 + .03 * Math.sin(Math.PI * f)]);
            }
        }
        const h = Math.max(...outline.map(p => p[1]));
        return { outline, inner, h };
    }
    const PARAMS = new Map<number, ReturnType<typeof scoopParams>>();
    const params = (seed: number) => { if (!PARAMS.has(seed)) PARAMS.set(seed, scoopParams(seed)); return PARAMS.get(seed)!; };

    // trame de points (une par parfum), en pixels écran comme une trame imprimée
    const tones = new Map<string, CanvasPattern>();
    function tonePattern(color: string){
        if (tones.has(color)) return tones.get(color)!;
        const c = document.createElement('canvas');
        c.width = c.height = 6;
        const g = context2d(c);
        g.fillStyle = color;
        g.beginPath(); g.arc(1.5, 1.5, 1.05, 0, Math.PI * 2); g.arc(4.5, 4.5, 1.05, 0, Math.PI * 2); g.fill();
        const pat = ctx.createPattern(c, 'repeat')!;
        tones.set(color, pat);
        return pat;
    }
    function sparkle(x: number, y: number, r: number, color: string){
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y);
        ctx.quadraticCurveTo(x, y, x, y - r);
        ctx.fill();
    }
    function scoopPath(cx: number, yb: number, w: number, pts: Pt2[], close = true){
        ctx.beginPath();
        pts.forEach(([x, y], k) => k ? ctx.lineTo(cx + x * w, yb - y * w) : ctx.moveTo(cx + x * w, yb - y * w));
        if (close) ctx.closePath();
    }
    // volume : lumière venant d'en haut à gauche
    function scoop(cx: number, yb: number, w: number, flavor: Flavor2d, shape: ReturnType<typeof makeScoopShape>, seed: number){
        const top = yb - w * shape.h, mid = yb - w * shape.h * .52;
        scoopPath(cx, yb, w, shape.outline);
        ctx.fillStyle = flavor.fill; ctx.fill();

        ctx.save();
        ctx.clip();
        // 1. modelé : clair en haut à gauche, sombre en bas à droite
        const g = ctx.createRadialGradient(cx - w * .2, top + w * .12, w * .04, cx + w * .05, mid, w * .62);
        g.addColorStop(0, 'rgba(255,255,255,.42)');
        g.addColorStop(.35, 'rgba(255,255,255,.08)');
        g.addColorStop(.7, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,.34)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - w, yb - w * 1.2, w * 2, w * 1.4);
        // 2. ombre propre en croissant sur le dôme, tramée comme dans un manga
        ctx.beginPath();
        ctx.rect(cx - w, yb - w * 1.2, w * 2, w * 1.4);
        ctx.ellipse(cx - w * .08, mid - w * .06, w * .46, w * shape.h * .5, -.12, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,.14)';
        ctx.fill('evenodd');
        ctx.fillStyle = tonePattern(flavor.tone);
        ctx.fill('evenodd');
        // 3. trame légère le long du bas de la boule
        ctx.fillStyle = tonePattern(flavor.tone);
        ctx.globalAlpha = .7;
        ctx.fillRect(cx - w, yb - w * .12, w * 2, w * .2);
        ctx.globalAlpha = 1;
        // 4. reflet brillant
        ctx.beginPath();
        ctx.ellipse(cx - w * .19, top + w * shape.h * .17, w * .13, w * .065, -.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,.55)';
        ctx.fill();
        ctx.restore();

        // traits noirs : contour et ligne du bourrelet
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        scoopPath(cx, yb, w, shape.outline);
        ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(1.4, w * .024); ctx.stroke();
        if (shape.inner.length) scoopPath(cx, yb, w, shape.inner, false); else ctx.beginPath();
        ctx.globalAlpha = .75; ctx.lineWidth = Math.max(1, w * .014); ctx.stroke(); ctx.globalAlpha = 1;
        ctx.lineCap = 'butt';

        // petits éclats
        sparkle(cx - w * .27, top + w * .07, Math.max(2, w * .035), flavor.spark);
        ctx.globalAlpha = .7;
        sparkle(cx + (hash(seed + 4) - .1) * w * .3, top + w * (.1 + hash(seed + 5) * .1), Math.max(1.5, w * .022), flavor.spark);
        ctx.globalAlpha = 1;
    }
    // ombre portée d'une boule sur celle du dessous
    function contactShadow(cx: number, yb: number, w: number){
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(cx + w * .04, yb - w * .02, w * .42, w * .1, 0, 0, Math.PI * 2);
        const g = ctx.createRadialGradient(cx + w * .04, yb - w * .02, 0, cx + w * .04, yb - w * .02, w * .42);
        g.addColorStop(0, 'rgba(0,0,0,.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.restore();
    }
    // compositions par assiette : [décalage x, décalage z, taille, posée sur la boule n° …]
    const LAYOUTS: LayoutItem[][] = [
        [[0, 0, 1.0]],                                                     // une grosse boule
        [[-.34, .12, .78], [.34, -.08, .72]],                              // deux côte à côte
        [[-.3, .05, .74], [.3, .05, .74], [0, 0, .7, 0, 1]],               // trio en pyramide
        [[0, 0, .95], [0, 0, .85, 0]],                                     // pile de deux
        [[0, 0, .95], [0, 0, .86, 0], [0, 0, .78, 1]],                     // pile de trois
        [[-.3, .1, .82], [-.3, .1, .72, 0], [.4, -.1, .6]],                // une pile et une petite à côté
        [[-.46, .1, .56], [0, -.12, .6], [.46, .08, .54]],                 // trois petites en ligne
        [[-.22, .1, .9], [.4, -.06, .62]],                                 // une grande et une petite
    ];
    // flaque fondue sous une boule posée sur l'assiette (dessinée en perspective)
    function puddle(px: number, py: number, pz: number, r: number, flavor: Flavor2d, seed: number, t: number){
        const n = 40, pts: (V3 | null)[] = [];
        const grow = reduce ? 1 : 1 + .12 * (.5 + .5 * Math.sin(t * .3 + seed));
        for (let k = 0; k < n; k++){
            const a = k / n * Math.PI * 2;
            const rr = r * grow * (1 + .14 * Math.sin(3 * a + seed) + .08 * Math.sin(5 * a + seed * 2) + .05 * Math.sin(8 * a + seed * 3));
            pts.push(P(px + rr * Math.cos(a), py, pz + rr * .85 * Math.sin(a)));
        }
        if (!allVisible(pts)) return;
        path(pts);
        ctx.fillStyle = flavor.pud; ctx.fill();
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#000'; ctx.lineWidth = 1.2; ctx.stroke();
        // petit reflet sur la flaque
        const c = P(px - r * .3, py, pz - r * .2);
        if (c){ ctx.beginPath(); ctx.ellipse(c[0], c[1], F * r * .18 / c[2], F * r * .05 / c[2], 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fill(); }
    }
    function iceCream(i: number, x: number, y: number, z: number, t: number){
        const layout = LAYOUTS[[3, 0, 5, 2, 7, 1, 4, 6, 2, 0, 5, 3][i % 12]! % LAYOUTS.length]!;
        // chaque assiette tourne sa composition et la décale un peu
        const th = hash(i * 2.13 + .3) * Math.PI * 2, co = Math.cos(th), si = Math.sin(th);
        const jx = (hash(i * 4.7) - .5) * .16, jz = (hash(i * 6.1) - .5) * .16;
        const pos = layout.map(([dx, dz]): Pt2 => {
            let rx = dx * co - dz * si + jx, rz = dx * si + dz * co + jz;
            const d = Math.hypot(rx, rz), lim = .5;
            if (d > lim){ rx *= lim / d; rz *= lim / d; }       // reste sur l'assiette
            return [rx, rz];
        });
        // profondeur de chaque boule : celle de sa base pour les boules posées dessus
        const depth = (k: number): number => {
            const e = layout[k]!;
            if (e[3] === undefined) return pos[k]![1];
            return Math.min(depth(e[3]), e[4] !== undefined ? depth(e[4]) : Infinity) - .001 * (k + 1);
        };
        const order = layout.map((_, k) => k).sort((a, b) => depth(b) - depth(a));

        const placed: { cx: number; yb: number; w: number; h: number }[] = [];
        for (const k of order){
            const [, , size, on, on2] = layout[k]!;
            // parfums différents sur une même assiette, ordre qui change d'une assiette à l'autre
            const fl = FLAVORS[(i * 3 + k * (1 + (i % 3 === 2 ? 2 : 0)) + Math.floor(hash(i) * 4)) % FLAVORS.length]!;
            const seed = i * 13 + k;
            let cx: number, yb: number, w: number;
            if (on === undefined){
                const [rx, rz] = pos[k]!;
                const b = P(x + rx, y, z + rz);
                if (!b) continue;
                w = SCOOP_W * size * F / b[2];
                // ombre de contact, et flaque si la boule fond
                const sh = ring(x + rx + .03, y + .004, z + rz + .02, SCOOP_W * size * .55, 32);
                if (allVisible(sh)){ path(sh); ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fill(); }
                if (params(seed).kind === 'fondue') puddle(x + rx, y + .006, z + rz, SCOOP_W * size * .58, fl, seed, t);
                cx = b[0]; yb = b[1] + w * .03;
            } else {
                const base = placed[on], base2 = on2 !== undefined ? placed[on2] : null;
                if (!base) continue;
                const bw = base2 ? (base.w + base2.w) / 2 : base.w;
                w = SCOOP_W * size * bw / (SCOOP_W * (base2 ? (layout[on]![2] + layout[on2!]![2]) / 2 : layout[on]![2]));
                cx = base2 ? (base.cx + base2.cx) / 2 : base.cx;
                yb = (base2 ? Math.min(base.yb, base2.yb) : base.yb) - (base2 ? .62 : .72) * (base2 ? (base.h + base2.h) / 2 : base.h) * bw;
                contactShadow(cx, yb, w);
            }
            const shape = makeScoopShape(params(seed), t, on !== undefined);
            scoop(cx, yb, w, fl, shape, seed);
            placed[k] = { cx, yb, w, h: shape.h };
        }
    }
    const PLATES = 12, GAP = 2.7, LOOP = PLATES * GAP;
    function drawPlates(t: number){
        const z = (BELT.z0 + BELT.z1) / 2;
        const items: { x: number; i: number }[] = [];
        for (let i = 0; i < PLATES; i++){
            const x = ((i * GAP + (reduce ? 0 : beltPos(t) + BELT_OFFSET)) % LOOP) - LOOP / 2;
            items.push({ x, i });
        }
        // du bord vers le centre : les faces latérales se recouvrent correctement
        items.sort((a, b) => Math.abs(b.x - cam.x) - Math.abs(a.x - cam.x));
        for (const { x, i } of items){
            const y = plate(x, z, i % 3 === 1);
            iceCream(i, x, y, z, t);
        }
    }

    // ---------- Couverts sur le comptoir ----------
    function drawTableware(){
        const y = COUNTER_TOP, z = 6.75;
        // repose-baguettes et baguettes
        box({ x: -3.1, y: y + .07, z, w: .3, h: .14, d: .22 }, { front: [RED, RED_HI], side: RED_LO, cap: '#b52c22', edge: 'rgba(255,180,170,.4)' });
        for (const dz of [-.07, .07]) box({ x: -4.7, y: y + .17, z: z + dz, w: 3.4, h: .06, d: .06 }, { front: ['#d9d6cf', '#efece6'], side: '#bdb9b1', cap: '#f3f1ec', edge: 'rgba(0,0,0,.4)' });
        // coupelle de sauce soja
        const s = ring(3.0, y + .02, z, .42);
        if (allVisible(s)){
            path(s); ctx.fillStyle = '#101010'; ctx.fill(); ctx.strokeStyle = line(.7); ctx.stroke();
            path(ring(3.0, y + .021, z, .3) as V3[]); ctx.fillStyle = '#2a0a07'; ctx.fill();
        }
        // tasse de thé
        cylinder(5.4, y, y + .46, z - .1, .22, '#141414', '#0e0e0e', line(.65));
        const lip = ring(5.4, y + .461, z - .1, .17);
        if (allVisible(lip)){ path(lip); ctx.fillStyle = '#3a3a2a'; ctx.fill(); }
    }

    // ---------- Rendu ----------
    let BELT_OFFSET = 0;
    function render(t: number){
        LAST_T = t;
        ctx.clearRect(0, 0, W, H);
        drawRoom();
        drawFishCells(t * 1000);
        for (const b of beams.slice().sort((a, b) => b.z - a.z)) box(b);
        for (const L of lanterns.filter(l => l.z > NOREN.z)) drawLantern(L, t);
        drawNoren(t);
        for (const L of lanterns.filter(l => l.z <= NOREN.z)) drawLantern(L, t);
        ctx.save(); ctx.globalAlpha = COUNTER_SHOW;
        if (COUNTER_SHOW > 0) drawCounter(t);
        // assiettes et crème glacée : en 3D si possible, sinon dessin 2D de secours (PERF-01 : sans carte graphique)
        const gl = typeof ICE_CREAM !== 'undefined' && ICE_CREAM !== null ? 'ready' : typeof GL_PENDING !== 'undefined' && GL_PENDING ? 'pending' : 'none';
        const layer = plateLayer({ gl, counterShown: COUNTER_SHOW });
        if (layer === '3d') ICE_CREAM!.render(t);
        else if (layer === '2d') drawPlates(t);
        ctx.restore();
        ctx = ctxFront;
        ctx.clearRect(0, 0, W, H);
        if (COUNTER_SHOW > 0){ ctx.save(); ctx.globalAlpha = COUNTER_SHOW; drawTableware(); ctx.restore(); }
        ctx = ctxBack;
    }

    // ---------- Mouvement : arrivée automatique puis léger flottement ----------
    const START_Z  = -18;
    const DELAY    = 150;
    const DURATION = 2500;
    const ease = (t: number) => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;

    // ---------- Comptoir et tapis pilotables (passage accueil <-> salons) ----------
    let BELT_D: number | null = null, LAST_T = 0, COUNTER_SHOW = initialView === 'rooms' ? 0 : 1;
    const beltPos = (t: number) => BELT_D === null ? t * BELT.speed : BELT_D;
    const BELT_ACC = 32;
    const beltDistance = (s: number) => BELT.speed * (s + BELT_ACC * s * s * s / 3);
    // le tapis s'élance (vers la droite) en accélérant
    const beltLeave = (ms: number, onStep?: ((k: number) => void) | null, onDone?: (() => void) | null) => {
        const D0 = beltPos(LAST_T) + BELT_OFFSET, t0 = performance.now();
        BELT_OFFSET = 0;
        const step = (now: number): void => {
            const s = Math.min(ms, now - t0) / 1000;
            BELT_D = D0 + beltDistance(s);
            onStep && onStep((now - t0) / ms);
            if (now - t0 < ms) raf(step); else onDone && onDone();
        };
        raf(step);
    };
    // le tapis arrive lancé (dist < 0 : vers la gauche) et ralentit jusqu'à reprendre son rythme
    const beltArrive = (dist: number, ms: number, onStep?: ((k: number) => void) | null, onDone?: (() => void) | null) => {
        const t0 = performance.now(), D1 = beltPos(LAST_T) + BELT_OFFSET + dist;
        BELT_OFFSET = 0;
        const step = (now: number): void => {
            const k = Math.min(1, (now - t0) / ms), remaining = dist * (1 - k) * (1 - k);
            BELT_D = D1 - remaining;
            onStep && onStep(k);
            if (k < 1) raf(step);
            else { const end = BELT_D; BELT_D = null; BELT_OFFSET = end - LAST_T * BELT.speed; onDone && onDone(); }
        };
        raf(step);
    };
    const setCounter = (targetLevel: number, ms: number) => {
        const c0 = COUNTER_SHOW, t0 = performance.now();
        const step = (now: number): void => { const k = Math.min(1, (now - t0) / ms); COUNTER_SHOW = c0 + (targetLevel - c0) * k * k * (3 - 2 * k); if (k < 1) raf(step); };
        raf(step);
    };

    resize();
    const onResize = () => { resize(); if (reduce) render(0); };
    addEventListener('resize', onResize);

    // ================= Assiettes et crème glacée en vraie 3D (Three.js) =================
    // Une couche WebGL transparente est posée sur le décor. Sa caméra reprend
    // exactement celle du décor (même position, même focale), donc les deux
    // couches restent alignées. Les boules sont de vrais volumes déformés,
    // éclairés en cel-shading (aplats de lumière et d'ombre, trame de points dans
    // l'ombre, reflet) avec un contour noir ; celles qui fondent se déforment
    // réellement image par image.
    var ICE_CREAM: { render(t: number): void; resize(): void; dispose(): void } | null = null;
    // PERF-01 : WebGL fonctionne, mais les assiettes 3D sont encore en construction (une par tâche)
    var GL_PENDING = false;
    let disposeGl: (() => void) | null = null;
    let pendingTask = 0;
    // PERF-01 : la couche 3D se prépare après le premier rendu, hors de la tâche qui hydrate la page
    GL_PENDING = true;
    const noGl = () => { GL_PENDING = false; if (reduce) render(0); };
    pendingTask = window.setTimeout(function(){
        if (stopped) return;
        if (!hardwareWebGL()) return noGl();   // PERF-01 : sans carte graphique, assiettes en 2D
        import('three').then(build3d, noGl);
    }, 0);
    function build3d(THREE: typeof import('three')){
        if (stopped) return;
        const glCanvas = canvases.iceCream;
        let renderer: THREE.WebGLRenderer;
        try {
            renderer = new THREE.WebGLRenderer({ canvas: glCanvas, ...ICE_CREAM_GL_OPTIONS });
        } catch (e) { return noGl(); }
        renderer.setClearColor(0x000000, 0);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(40, 1, .3, 200);
        // le décor compte z vers le fond ; Three.js compte z vers nous
        const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, -z);

        // ---------- Matériau cel-shading ----------
        const LIGHT = new THREE.Vector3(-.55, .7, .45).normalize();     // en haut à gauche, vers nous (repère caméra)
        const toonVS = `
            varying vec3 vN; varying vec3 vV;
            void main(){
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                vN = normalize(normalMatrix * normal);
                vV = normalize(-mv.xyz);
                gl_Position = projectionMatrix * mv;
            }`;
        const toonFS = `
            uniform vec3 uColor; uniform vec3 uMid; uniform vec3 uShade; uniform vec3 uTone;
            uniform vec3 uLight; uniform float uDpr;
            varying vec3 vN; varying vec3 vV;
            float dots(float spacing, float radius){
                vec2 p = gl_FragCoord.xy / uDpr;
                vec2 g = mod(p, spacing) - spacing * .5;
                vec2 q = mod(p + spacing * .5, spacing) - spacing * .5;
                return step(min(length(g), length(q)), radius);
            }
            void main(){
                vec3 n = normalize(vN);
                float d = dot(n, uLight);
                vec3 c = uColor;
                if (d < .42) c = uMid;
                if (d < .08) c = uShade;
                // trame façon manga : légère dans les demi-teintes, plus dense dans l'ombre
                if (d < .42 && d >= .08) c = mix(c, uTone, dots(6.0, .9) * .55);
                if (d < .08) c = mix(c, uTone, dots(5.0, 1.45));
                // reflet brillant
                vec3 h = normalize(uLight + vV);
                float sp = pow(max(dot(n, h), 0.0), 70.0);
                c = mix(c, vec3(1.0), smoothstep(.45, .6, sp) * .85);
                // léger liseré de lumière sur le bord opposé
                float rim = 1.0 - max(dot(n, vV), 0.0);
                c += vec3(.06) * smoothstep(.75, .95, rim) * step(.0, -d);
                gl_FragColor = vec4(c, 1.0);
            }`;
        const outlineVS = `
            uniform float uW;
            void main(){
                vec3 p = position + normal * uW;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
            }`;
        const outlineFS = `void main(){ gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }`;
        const outlineMat = new THREE.ShaderMaterial({ uniforms: { uW: { value: .018 } }, vertexShader: outlineVS, fragmentShader: outlineFS, side: THREE.BackSide });

        const col = (h: string | number) => new THREE.Color(h);
        const PALETTE = [
            { c: '#8b3cf0', m: '#7429dc', s: '#5419b0', t: '#3a0c86', pud: '#6a22c9' },   // violet
            { c: '#b0407f', m: '#962f69', s: '#741f50', t: '#4f0f34', pud: '#82235c' },   // prune
            { c: '#fff27e', m: '#f3dc52', s: '#d9b82c', t: '#9a7d0e', pud: '#e8cf3c' },   // citron
            { c: '#ff8f40', m: '#f07224', s: '#cc5512', t: '#8a3200', pud: '#e0661a' },   // orange
        ];
        const toonMats = PALETTE.map(p => new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: col(p.c) }, uMid: { value: col(p.m) }, uShade: { value: col(p.s) }, uTone: { value: col(p.t) },
                uLight: { value: LIGHT }, uDpr: { value: 1 },
            },
            vertexShader: toonVS, fragmentShader: toonFS,
        }));
        const pudMats = PALETTE.map(p => new THREE.MeshBasicMaterial({ color: col(p.pud) }));
        const black = new THREE.MeshBasicMaterial({ color: 0x000000 });

        // ---------- Déformation d'une boule ----------
        const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
        const angDiff = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

        function shapeScoop(geo: THREE.BufferGeometry, base: Float32Array, p: ReturnType<typeof scoopParams>, t: number, stacked: boolean){
            const pos = geo.attributes.position!.array as Float32Array;
            const melt = p.kind === 'fondue', soft = p.kind === 'molle';
            const sag = melt && !reduce ? 1 - .06 * (.5 + .5 * Math.sin(t * .35 + p.sagPh)) : 1;
            const R = p.rx, Ry = p.ry * 1.1 * sag;
            const bumpK = soft ? .7 : melt ? .55 : .42;
            const drips = melt && stacked ? p.drips.map(d => ({
                th: (d.x + .5) * Math.PI * 2 * .9 - Math.PI * .45 + Math.PI / 2,   // réparties à l'avant
                w: d.w * 4.2,
                len: d.l * 2.4 * (reduce ? .8 : .55 + .45 * (.5 + .5 * Math.sin(t * d.sp + d.ph))),
            })) : [];
            for (let i = 0; i < pos.length; i += 3){
                const ux = base[i]!, uy = base[i + 1]!, uz = base[i + 2]!;
                const th = Math.atan2(uz, ux), sXZ = Math.sqrt(ux * ux + uz * uz);
                let b = 1;
                for (let k = 0; k < p.harm.length; k++){
                    const h = p.harm[k]!;
                    if (k > 3) break;                                       // seulement les ondulations larges
                    b += bumpK * h.a * Math.sin((k + 2) * th + h.p) * (.75 + .25 * Math.sin((k + 1) * uy * 1.4 + h.p)) * Math.min(1, sXZ * 2.5);   // s'atténue aux pôles
                }
                let rad = sXZ * R * b, y = uy * Ry * b;
                // le bas s'aplatit pour poser sur l'assiette
                const flatAt = melt ? -.3 : soft ? -.55 : -.48;
                if (uy < flatAt){ y = flatAt * Ry + (uy - flatAt) * Ry * (melt ? .12 : .22); }
                if (p.kind === 'ferme'){
                    // bord tiré à la cuillère : il s'évase et ondule
                    const f = ss(-.15, -.62, uy);
                    rad *= 1 + .08 * f + p.waveAmp * 1.4 * f * Math.sin(p.waves * th + p.harm[0]!.p);
                    y -= f * p.waveAmp * .9 * (1 + Math.sin(p.waves * th + p.harm[0]!.p));
                } else if (soft){
                    rad *= 1 + .05 * ss(-.2, -.7, uy);
                } else {
                    // fondue : la base s'étale en bourrelet mou
                    const f = ss(.15, -.75, uy);
                    rad *= 1 + .26 * f * (1 + .25 * Math.sin(3 * th + p.sagPh));
                }
                // coulures : la matière descend et s'écarte, au bout arrondi
                for (const d of drips){
                    const g = Math.exp(-Math.pow(angDiff(th, d.th) / d.w, 2));
                    const low = ss(.25, -.95, uy);
                    y -= d.len * g * low;
                    rad += d.len * g * low * .45;
                }
                const k = sXZ > 1e-6 ? rad / sXZ : 0;
                pos[i] = ux * k; pos[i + 1] = y + p.tilt * Math.max(0, uy) * 0; pos[i + 2] = uz * k;
                if (p.tilt){ pos[i] = pos[i]! + p.tilt * Math.max(0, uy) * Ry; }
            }
            geo.attributes.position!.needsUpdate = true;
            geo.computeVertexNormals();
            geo.computeBoundingBox();
        }

        function sphereMerged(){
            const src = new THREE.SphereGeometry(.5, 64, 44);
            const a = src.attributes.position!.array as Float32Array, idx = src.index!.array;
            const map = new Map<string, number>(), pos: number[] = [], remap = new Uint32Array(a.length / 3);
            for (let i = 0; i < a.length / 3; i++){
                const key = Math.round(a[i*3]! * 1e4) + ',' + Math.round(a[i*3+1]! * 1e4) + ',' + Math.round(a[i*3+2]! * 1e4);
                if (!map.has(key)){ map.set(key, pos.length / 3); pos.push(a[i*3]!, a[i*3+1]!, a[i*3+2]!); }
                remap[i] = map.get(key)!;
            }
            const out: number[] = [];
            for (let k = 0; k < idx.length; k += 3){
                const A = remap[idx[k]!]!, B = remap[idx[k+1]!]!, C = remap[idx[k+2]!]!;
                if (A !== B && B !== C && A !== C) out.push(A, B, C);      // retire les triangles écrasés des pôles
            }
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
            g.setIndex(out);
            return g;
        }

        // ---------- Flaque ----------
        function puddleGeo(seed: number, r: number){
            const s = new THREE.Shape();
            const n = 48;
            for (let k = 0; k <= n; k++){
                const a = k / n * Math.PI * 2;
                const rr = r * (1 + .14 * Math.sin(3 * a + seed) + .08 * Math.sin(5 * a + seed * 2) + .05 * Math.sin(8 * a + seed * 3));
                const x = rr * Math.cos(a), y = rr * .9 * Math.sin(a);
                k ? s.lineTo(x, y) : s.moveTo(x, y);
            }
            const g = new THREE.ShapeGeometry(s, 4);
            g.rotateX(-Math.PI / 2);
            return g;
        }

        // ---------- Assiettes ----------
        const plateMat = new THREE.MeshBasicMaterial({ color: 0x101010 });
        const rimWhite = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .75 });
        const rimRed = new THREE.MeshBasicMaterial({ color: 0xd23c30 });
        const innerRing = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .2 });
        const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .55, depthWrite: false });
        const plateGeo = new THREE.CylinderGeometry(.78, .72, .06, 64);
        const ringOuter = new THREE.RingGeometry(.755, .785, 64); ringOuter.rotateX(-Math.PI / 2);
        const ringOuterRed = new THREE.RingGeometry(.745, .79, 64); ringOuterRed.rotateX(-Math.PI / 2);
        const ringInner = new THREE.RingGeometry(.555, .565, 64); ringInner.rotateX(-Math.PI / 2);
        const shadowGeo = new THREE.CircleGeometry(.5, 40); shadowGeo.rotateX(-Math.PI / 2);

        const plateTop = BELT.y + .1;
        const beltZ = (BELT.z0 + BELT.z1) / 2;
        const plates: { g: THREE.Group; i: number }[] = [];
        const animated: ({ kind: 'puddle'; obj: THREE.Group; seed: number } | { kind: 'scoop'; geo: THREE.BufferGeometry; base: Float32Array; p: ReturnType<typeof scoopParams>; stacked: boolean; plate: number })[] = [];

        // PERF-01 : la sphère de base est la même pour toutes les boules, calculée une seule fois
        const SPHERE = sphereMerged();
        function buildPlate(i: number){
            const g = new THREE.Group();
            scene.add(g);
            const disc = new THREE.Mesh(plateGeo, plateMat);
            disc.position.y = plateTop - .03;
            g.add(disc);
            const rim = new THREE.Mesh(i % 3 === 1 ? ringOuterRed : ringOuter, i % 3 === 1 ? rimRed : rimWhite);
            rim.position.y = plateTop + .002; g.add(rim);
            const inn = new THREE.Mesh(ringInner, innerRing); inn.position.y = plateTop + .002; g.add(inn);

            // composition : la même logique de placement que la version 2D
            const layout = LAYOUTS[[3, 0, 5, 2, 7, 1, 4, 6, 2, 0, 5, 3][i % 12]! % LAYOUTS.length]!;
            const th = hash(i * 2.13 + .3) * Math.PI * 2, co = Math.cos(th), si = Math.sin(th);
            const jx = (hash(i * 4.7) - .5) * .16, jz = (hash(i * 6.1) - .5) * .16;
            const pos = layout.map(([dx, dz]): Pt2 => {
                let rx = dx * co - dz * si + jx, rz = dx * si + dz * co + jz;
                const d = Math.hypot(rx, rz), lim = .48;
                if (d > lim){ rx *= lim / d; rz *= lim / d; }
                return [rx, rz];
            });
            const placed: { x: number; y: number; z: number; size: number; top: number }[] = [];
            // les bases d'abord, puis ce qui est posé dessus
            const order = layout.map((_, k) => k).sort((a, b) => Number(layout[a]!.length > 3) - Number(layout[b]!.length > 3));
            for (const k of order){
                const [, , size, on, on2] = layout[k]!;
                const fi = (i * 3 + k * (1 + (i % 3 === 2 ? 2 : 0)) + Math.floor(hash(i) * 4)) % PALETTE.length;
                const seed = i * 13 + k;
                const p = params(seed);
                const stacked = on !== undefined;

                const geo = SPHERE.clone();
                const base = Float32Array.from(geo.attributes.position!.array).map(v => v * 2);   // directions unitaires
                shapeScoop(geo, base, p, 0, stacked);
                const mesh = new THREE.Mesh(geo, toonMats[fi]!);
                const line = new THREE.Mesh(geo, outlineMat);
                mesh.add(line);
                mesh.scale.setScalar(size);
                mesh.rotation.y = hash(seed * 3.3) * Math.PI * 2;      // chaque boule tournée différemment
                g.add(mesh);
                const bb = geo.boundingBox!;

                let x: number, y: number, z: number;
                if (!stacked){
                    [x, z] = pos[k]!;
                    y = plateTop - bb.min.y * size;
                    // ombre de contact
                    const sh = new THREE.Mesh(shadowGeo, shadowMat);
                    sh.scale.setScalar(size * 1.05);
                    sh.position.set(x + .03, plateTop + .004, -(z + .02));
                    g.add(sh);
                    // flaque si elle fond
                    if (p.kind === 'fondue'){
                        const pg = puddleGeo(seed, .56 * size);
                        const pm = new THREE.Mesh(pg, pudMats[fi]!);
                        const po = new THREE.Mesh(pg, black);
                        po.scale.setScalar(1.05); po.position.y = -.002;
                        const pud = new THREE.Group();
                        pud.add(po); pud.add(pm);
                        pud.position.set(x, plateTop + .008, -z);
                        pud.rotation.y = hash(seed) * 6.28;
                        g.add(pud);
                        animated.push({ kind: 'puddle', obj: pud, seed });
                    }
                } else {
                    const b1 = placed[on!]!, b2 = on2 !== undefined ? placed[on2]! : null;
                    x = b2 ? (b1.x + b2.x) / 2 : b1.x;
                    z = b2 ? (b1.z + b2.z) / 2 : b1.z;
                    const topOf = (b: { y: number; top: number; size: number }) => b.y + b.top * b.size;
                    const support = b2 ? (topOf(b1) + topOf(b2)) / 2 - .12 : topOf(b1) - .16 * b1.size;
                    y = support - bb.min.y * size * .55;
                }
                mesh.position.set(x, y, -z);
                placed[k] = { x, y, z, size, top: bb.max.y };
                if (p.kind === 'fondue') animated.push({ kind: 'scoop', geo, base, p, stacked, plate: i });
            }
            plates.push({ g, i });
        }

        // ---------- Rendu, synchronisé avec la caméra du décor ----------
        function resize3d(){
            renderer.setPixelRatio(DPR);
            renderer.setSize(W, H, false);
            for (const m of toonMats) m.uniforms.uDpr!.value = DPR;
            camera.aspect = W / H;
            camera.fov = 2 * Math.atan((H / 2) / F) * 180 / Math.PI;
            camera.updateProjectionMatrix();
        }
        // PERF-01 : seules les boules à l'écran (avec une marge) sont déformées, chacune à son tour
        let frame3d = 0;
        const onScreen: boolean[] = [];
        const PLATE_SPAN = 1.6;
        function render3d(t: number){
            camera.position.set(cam.x, cam.y, -cam.z);
            for (const { g, i } of plates){
                const x = ((i * GAP + (reduce ? 0 : beltPos(t) + BELT_OFFSET)) % LOOP) - LOOP / 2;
                g.position.set(x, 0, -beltZ);
                g.visible = Math.abs(x - cam.x) < 22;
                onScreen[i] = g.visible && spanOnScreen(P(x - PLATE_SPAN, BELT.y, beltZ)?.[0] ?? null, P(x + PLATE_SPAN, BELT.y, beltZ)?.[0] ?? null, W);
            }
            if (!reduce){
                frame3d++;
                animated.forEach((a, k) => {
                    if (a.kind === 'puddle') a.obj.scale.setScalar(1 + .12 * (.5 + .5 * Math.sin(t * .3 + a.seed)));
                    else if (onScreen[a.plate] && reshapeThisFrame(k, frame3d)) shapeScoop(a.geo, a.base, a.p, t, a.stacked);
                });
            }
            renderer.render(scene, camera);
        }
        resize3d();
        // PERF-01 : une assiette par tâche, puis la compilation des shaders, pour ne jamais bloquer le fil principal
        // au chargement de la page ; le comptoir reste sans assiettes pendant ces quelques images.
        const dispose = () => renderer.dispose();
        const steps = [...Array.from({ length: PLATES }, (_, i) => () => buildPlate(i)), () => renderer.compile(scene, camera)];
        const next = (k: number) => {
            pendingTask = window.setTimeout(() => {
                if (stopped) return;
                steps[k]!();
                if (k + 1 < steps.length) return next(k + 1);
                GL_PENDING = false;
                resize3d();   // la fenêtre a pu changer de taille pendant la construction
                ICE_CREAM = { render: render3d, resize: resize3d, dispose };
                if (reduce) render(0);
            }, 0);
        };
        next(0);
        disposeGl = dispose;
    }

    // premier rendu après la couche 3D : sans elle, les assiettes passent en 2D dès la première image
    if (reduce){
        render(0);
    } else {
        let t0: number | null = null;
        const frame = (now: number): void => {
            if (t0 === null) t0 = initialView === 'rooms' ? now - DURATION : now + DELAY;
            const s = (now - t0) / 1000;
            const k = ease(Math.min(1, Math.max(0, s * 1000 / DURATION)));
            const idle = Math.max(0, s - DURATION / 1000);
            const settle = Math.min(1, idle / 2);
            cam.z = START_Z * (1 - k);
            cam.x = Math.sin(idle * .2) * .35 * settle;
            cam.y = Math.sin(idle * .14 + 1) * .15 * settle;
            render(Math.max(0, s));
            raf(frame);
        };
        cam.z = initialView === 'rooms' ? 0 : START_Z;
        render(0);
        raf(frame);
    }

    return {
        /** Monte (1) ou range (0) le comptoir. */
        setCounter,
        /** Le tapis s'élance vers la droite en accélérant. */
        beltLeave,
        /** Le tapis arrive lancé puis reprend son rythme (dist < 0 : vers la gauche). */
        beltArrive,
        setIceCreamOpacity: (o: number | string) => { canvases.iceCream.style.opacity = String(o); },
        beltSpeed: BELT.speed,
        beltAcceleration: BELT_ACC,
        destroy() {
            stopped = true;
            removeEventListener('resize', onResize);
            clearTimeout(pendingTask);
            disposeGl?.();
        },
    };
}
