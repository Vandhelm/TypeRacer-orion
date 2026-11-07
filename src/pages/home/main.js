import i18n, { translateDom } from '../../i18n';

// ---------- Langue (système de traduction partagé : src/i18n) ----------
const t = (key) => i18n.t('home.' + key);

const password  = document.getElementById('password');
const revealBtn = document.getElementById('reveal-password');

function applyLanguage(){
    translateDom();
    revealBtn.textContent = t(password.type === 'text' ? 'hide' : 'show');
    document.querySelectorAll('.hanging-tab').forEach(b => {
        const on = b.dataset.lang === i18n.resolvedLanguage;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on);
    });
}
document.querySelectorAll('.hanging-tab').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.lang !== i18n.resolvedLanguage) i18n.changeLanguage(b.dataset.lang);
}));
i18n.on('languageChanged', applyLanguage);

// ---------- Jouer / Compte ----------
const panes = { play: document.getElementById('pane-play'), account: document.getElementById('pane-account') };
document.querySelectorAll('.view-tab').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.view-tab').forEach(v => {
        const on = v === b;
        v.classList.toggle('active', on);
        v.setAttribute('aria-pressed', on);
        panes[v.dataset.view].classList.toggle('is-hidden', !on);
        panes[v.dataset.view].setAttribute('aria-hidden', !on);
    });
}));

// ---------- Mot de passe ----------
revealBtn.addEventListener('click', () => {
    const visible = password.type === 'password';
    password.type = visible ? 'text' : 'password';
    revealBtn.setAttribute('aria-pressed', visible);
    revealBtn.textContent = t(visible ? 'hide' : 'show');
});

// ---------- Code en majuscules ----------
const code = document.getElementById('code');
code.addEventListener('input', () => { code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });

// ---------- Tampon de confirmation ----------
const stamp = document.querySelector('.stamp');
let stampTimer = null;
function showStamp(key){
    clearTimeout(stampTimer);
    stamp.classList.remove('on');
    stamp.querySelector('span').textContent = t(key);
    void stamp.offsetWidth;                          // relance l'animation
    stamp.classList.add('on');
    stampTimer = setTimeout(() => stamp.classList.remove('on'), 1700);
}
panes.play.addEventListener('submit', e => { e.preventDefault(); showStamp('stampPlay'); });
panes.account.addEventListener('submit', e => { e.preventDefault(); showStamp('stampAccount'); });
// code saisi : on rejoint le kiosque avec le code déjà inscrit
function enterCode(){
    const c = code.value;
    showStamp('stampCode');
    if (c.length === 6) setTimeout(() => { location.href = 'room.html?code=' + c; }, 900);
    else code.focus();
}
document.getElementById('enter-code').addEventListener('click', enterCode);
code.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); enterCode(); } });

applyLanguage();

window.INITIAL_VIEW = location.hash === '#rooms' ? 'rooms' : 'home';
// ================= Décor : comptoir de sushi en formes géométriques =================
// Tout est placé dans un espace 3D (x à droite, y en haut, z vers le fond)
// et projeté depuis la caméra : on est assis au comptoir, un tapis roulant
// passe devant avec des assiettes, un noren pend en haut, des lanternes
// rouges sont suspendues et des cloisons shoji bordent la salle.
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = document.getElementById('decor');
let ctx = canvas.getContext('2d');
const ctxBack = ctx;
// couche de premier plan (couverts du comptoir), au-dessus de la crème glacée 3D
const canvasFront = document.getElementById('front-layer');
const ctxFront = canvasFront.getContext('2d');

const line = a => `rgba(255,255,255,${a})`;
const RED = '#9e1f17', RED_HI = '#c0342a', RED_LO = '#5c120d';
const DARK = { front: ['#070707', '#151515'], side: '#2a2a2a', cap: '#1d1d1d' };
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
function P(x, y, z){
    const dz = z - cam.z;
    if (dz < NEAR) return null;
    return [CX + F * (x - cam.x) / dz, CY - F * (y - cam.y) / dz, dz];
}
function path(pts){
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
}
function poly(pts3, fill, stroke, lw = 1){
    const pts = pts3.map(p => P(...p));
    if (pts.some(p => !p)) return;
    path(pts);
    if (fill){ ctx.fillStyle = fill; ctx.fill(); }
    if (stroke){ ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function seg(a, b, stroke, lw = 1){
    let [x1, y1, z1] = a, [x2, y2, z2] = b;
    const n = cam.z + NEAR * 1.01;
    if (z1 < n && z2 < n) return;
    if (z1 < n){ const t = (n - z1) / (z2 - z1); x1 += (x2 - x1) * t; y1 += (y2 - y1) * t; z1 = n; }
    if (z2 < n){ const t = (n - z2) / (z1 - z2); x2 += (x1 - x2) * t; y2 += (y1 - y2) * t; z2 = n; }
    const p = P(x1, y1, z1), q = P(x2, y2, z2);
    ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
    ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke();
}
const fade = z => Math.max(0, Math.min(1, 1 - (z - cam.z) / (ROOM.z + 6 - cam.z)));

// ---------- Bloc opaque : seulement les faces tournées vers la caméra ----------
function box(b, col = DARK){
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
        const a = P(x0, y1, z0), c = P(x1, y0, z0);
        const g = ctx.createLinearGradient(a[0], 0, c[0], 0);
        g.addColorStop(0, col.front[0]); g.addColorStop(1, col.front[1]);
        poly([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], g, col.edge || line(.35 + .45 * fade(b.z)));
    }
}

// cercle horizontal (plan y) projeté
function ring(x, y, z, r, n = 40){
    return Array.from({ length: n }, (_, i) => {
        const a = i / n * Math.PI * 2;
        return P(x + r * Math.cos(a), y, z + r * Math.sin(a));
    });
}
function hull(pts){
    pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts){ while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (const p of pts.reverse()){ while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
}
// cylindre debout (axe vertical)
function cylinder(x, y0, y1, z, r, sideFill, topFill, stroke){
    const b = ring(x, y0, z, r), t = ring(x, y1, z, r);
    if (b.some(p => !p) || t.some(p => !p)) return null;
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
    for (const [x, y] of [[-X, B], [X, B], [-X, T], [X, T]]) seg([x, y, cam.z], [x, y, Z], line(.4));
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
let fishTiles = null;                       // une image par étape, avec liseré blanc
const sheet = new Image();
sheet.onload = () => {
    const fw = sheet.width / FISH_FRAMES, fh = sheet.height, pad = 4;
    fishTiles = Array.from({ length: FISH_FRAMES }, (_, i) => {
        // silhouette blanche pour le liseré
        const sil = document.createElement('canvas');
        sil.width = fw; sil.height = fh;
        const s = sil.getContext('2d');
        s.drawImage(sheet, i * fw, 0, fw, fh, 0, 0, fw, fh);
        s.globalCompositeOperation = 'source-in';
        s.fillStyle = '#fff'; s.fillRect(0, 0, fw, fh);

        const t = document.createElement('canvas');
        t.width = fw + pad * 2; t.height = fh + pad * 2;
        const c = t.getContext('2d');
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
sheet.src = 'data:image/webp;base64,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';

function fishTile(ms){
    if (!fishTiles) return null;
    let t = (reduce ? 0 : ms) % FISH_TOTAL, i = 0;
    while (t >= FISH_DUR[i]){ t -= FISH_DUR[i]; i++; }
    return fishTiles[i];
}

const L3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const Q3 = (q, u, v) => L3(L3(q[0], q[1], u), L3(q[3], q[2], u), v);   // point (u, v) d'une face

// Plaque une image sur une face en perspective, en fines bandes (correct en profondeur)
function texQuad(tex, q, strips){
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
function drawFish(face, lenU, lenV, perspective, ms){
    const tex = fishTile(ms);
    if (!tex) return;
    if (face.some(v => !P(...v))) return;
    const a = P(...face[0]), c = P(...face[2]);
    if (Math.hypot(c[0] - a[0], c[1] - a[1]) < 28) return;   // trop petit à l'écran

    // point local (s, t) de la face, mesuré depuis son centre en unités du monde
    const pt = (s, t) => Q3(face, .5 + s / lenU, .5 + t / lenV);
    const m = P(...pt(0, 0));
    if (!m) return;

    // comment un pas sur la face se traduit à l'écran
    const e = .05;
    const ps = P(...pt(e, 0)), pt_ = P(...pt(0, e));
    if (!ps || !pt_) return;
    const Ds = [(ps[0] - m[0]) / e, (ps[1] - m[1]) / e];
    const Dt = [(pt_[0] - m[0]) / e, (pt_[1] - m[1]) / e];

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
    const loc = [[s0, t0], [s0 + hs * fw, t0 + ht * fw], [s0 + hs * fw + ds * fh, t0 + ht * fw + dt * fh], [s0 + ds * fh, t0 + dt * fh]];

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
    const sub = loc.map(([cs, ct]) => pt(cs - hs * back, ct - ht * back));

    ctx.save();
    ctx.beginPath();
    const fq = face.map(v => P(...v));
    ctx.moveTo(fq[0][0], fq[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(fq[i][0], fq[i][1]);
    ctx.closePath();
    ctx.clip();
    texQuad(tex, sub, perspective ? 14 : 1);
    ctx.restore();
}

// ---------- Têtes de poisson dans certaines cases des cloisons shoji ----------
const SHOJI = { dz: 2.4, dy: 1.6 };
// une case sur quatre environ, choisie une fois pour toutes, en quinconce
const fishCells = [];
for (const side of [-1, 1]){
    for (let k = 3; (k + 1) * SHOJI.dz <= ROOM.z; k++){
        for (let r = 0; r < 6; r++){
            const y0 = COUNTER_TOP + r * SHOJI.dy;
            if (y0 + SHOJI.dy > ROOM.top) continue;
            if ((k * 3 + r * 5 + (side > 0 ? 2 : 0)) % 4 === 0) fishCells.push({ side, z0: k * SHOJI.dz, y0 });
        }
    }
}
function drawFishCells(ms){
    for (const c of fishCells.slice().sort((a, b) => b.z0 - a.z0)){
        const x = c.side * ROOM.x, z0 = c.z0, z1 = z0 + SHOJI.dz, y0 = c.y0, y1 = y0 + SHOJI.dy;
        if (z0 - cam.z < 1) continue;
        const face = [[x, y1, z0], [x, y1, z1], [x, y0, z1], [x, y0, z0]];
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
function drawNoren(t){
    const { z, top, bottom, x0, x1, n, gap } = NOREN;
    box({ x: 0, y: top + .08, z: z - .1, w: x1 - x0 + 1, h: .16, d: .16 });           // tringle
    const pw = (x1 - x0) / n;
    for (let i = 0; i < n; i++){
        const a = x0 + i * pw + gap / 2, b = x0 + (i + 1) * pw - gap / 2;
        const sway = reduce ? 0 : Math.sin(t * .9 + i * .8) * .12;            // le bas ondule à peine
        const pts = [[a, top, z], [b, top, z], [b + sway, bottom, z + Math.abs(sway) * .5], [a + sway, bottom, z + Math.abs(sway) * .5]];
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
function drawLantern(L, t){
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
function drawCounter(t){
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
function plate(x, z, red){
    const y = BELT.y + .1;
    const out = ring(x, y, z, .78), inn = ring(x, y + .001, z, .56);
    if (out.some(p => !p)) return y;
    path(out); ctx.fillStyle = '#101010'; ctx.fill();
    ctx.strokeStyle = red ? 'rgba(210,60,48,.95)' : line(.75); ctx.lineWidth = red ? 2 : 1; ctx.stroke();
    path(inn); ctx.strokeStyle = line(.2); ctx.lineWidth = 1; ctx.stroke();
    return y;
}
// ---------- Boules de crème glacée, dessin façon manga ----------
// D'après la vidéo : forme bosselée dessinée à la main, plus large que haute,
// quelques coulures irrégulières, trame de points le long des bords,
// petits reflets en étoile, contour noir ; les boules s'empilent en se
// recouvrant (les coulures de la boule du dessus passent sur celle du dessous).
const FLAVORS = [
    { fill: '#8b3cf0', tone: 'rgba(60,10,140,.45)',  spark: '#d8c2ff', pud: '#6a22c9' },   // violet
    { fill: '#a8357a', tone: 'rgba(80,10,50,.45)',   spark: '#f3b9dc', pud: '#82235c' },   // prune
    { fill: '#fff07a', tone: 'rgba(170,140,20,.42)', spark: '#ffffff', pud: '#e8cf3c' },   // citron
    { fill: '#ff8a3a', tone: 'rgba(160,60,0,.5)',    spark: '#ffe0c8', pud: '#e0661a' },   // orange
];
const SCOOP_W = 1.0;          // largeur d'une boule (unités du monde)

// pseudo-hasard stable
const hash = n => { const r = Math.sin(n * 12.9898) * 43758.5453; return r - Math.floor(r); };

// contour d'une boule en coordonnées normalisées (x de -0,5 à 0,5, y vers le haut, 0 = bas du bord)
// ---------- Forme de chaque boule ----------
// Chaque boule a sa propre forme, tirée de son numéro : largeur, hauteur,
// inclinaison et bosses changent. Trois sortes :
//   ferme   : dôme et bord ondulé tiré à la cuillère
//   molle   : plus ronde et bosselée, bord irrégulier
//   fondue  : affaissée et élargie ; posée sur une autre boule, elle coule
//             par-dessus (coulures qui s'allongent et se rétractent) ;
//             posée sur l'assiette, elle s'étale en flaque
function scoopParams(seed){
    const r = k => hash(seed * 1.7 + k);
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
function makeScoopShape(P_, t, stacked){
    const bumps = a => 1 + P_.harm.reduce((s, h, k) => s + h.a * Math.sin((k + 2) * a + h.p), 0);
    const melt = P_.kind === 'fondue';
    const sag = melt && !reduce ? 1 - .05 * (.5 + .5 * Math.sin(t * .35 + P_.sagPh)) : 1;
    const ry = P_.ry * sag, rx = P_.rx * (melt ? 1 + (1 - sag) * .6 : 1);
    const s0 = melt ? .55 : P_.kind === 'molle' ? .5 : .32;     // jusqu'où le dôme descend
    const base = .1 + (melt ? 0 : .02);
    const cy = base + ry * Math.sin(s0);
    const outline = [], inner = [];

    for (let k = 0; k <= 72; k++){
        const a = Math.PI + s0 - (Math.PI + 2 * s0) * k / 72;
        const b = bumps(a), up = Math.max(0, Math.sin(a));
        outline.push([rx * Math.cos(a) * b + P_.tilt * up, cy + ry * Math.sin(a) * b]);
    }
    const R = outline[outline.length - 1], L = outline[0];

    // bas de la boule, de droite à gauche
    const flare = melt ? .07 : P_.kind === 'ferme' ? .04 : .015;
    const right = R[0] + flare, left = L[0] - flare;
    outline.push([right, base * .8]);
    const n = P_.waves;
    for (let x = right - .01; x >= left + .01; x -= .006){
        const u = (x - left) / (right - left), f = (u * n) % 1;
        let y;
        if (P_.kind === 'ferme') y = P_.waveAmp * (1 - Math.sin(Math.PI * f));
        else y = .025 + .02 * Math.sin(u * 9 + P_.sagPh) + .012 * Math.sin(u * 23 + P_.harm[0].p);
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
const PARAMS = new Map();
const params = seed => { if (!PARAMS.has(seed)) PARAMS.set(seed, scoopParams(seed)); return PARAMS.get(seed); };

// trame de points (une par parfum), en pixels écran comme une trame imprimée
const tones = new Map();
function tonePattern(color){
    if (tones.has(color)) return tones.get(color);
    const c = document.createElement('canvas');
    c.width = c.height = 6;
    const g = c.getContext('2d');
    g.fillStyle = color;
    g.beginPath(); g.arc(1.5, 1.5, 1.05, 0, Math.PI * 2); g.arc(4.5, 4.5, 1.05, 0, Math.PI * 2); g.fill();
    const pat = ctx.createPattern(c, 'repeat');
    tones.set(color, pat);
    return pat;
}
function sparkle(x, y, r, color){
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
}
function scoopPath(cx, yb, w, pts, close = true){
    ctx.beginPath();
    pts.forEach(([x, y], k) => k ? ctx.lineTo(cx + x * w, yb - y * w) : ctx.moveTo(cx + x * w, yb - y * w));
    if (close) ctx.closePath();
}
// volume : lumière venant d'en haut à gauche
function scoop(cx, yb, w, flavor, shape, seed){
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
function contactShadow(cx, yb, w){
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
const LAYOUTS = [
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
function puddle(px, py, pz, r, flavor, seed, t){
    const n = 40, pts = [];
    const grow = reduce ? 1 : 1 + .12 * (.5 + .5 * Math.sin(t * .3 + seed));
    for (let k = 0; k < n; k++){
        const a = k / n * Math.PI * 2;
        const rr = r * grow * (1 + .14 * Math.sin(3 * a + seed) + .08 * Math.sin(5 * a + seed * 2) + .05 * Math.sin(8 * a + seed * 3));
        pts.push(P(px + rr * Math.cos(a), py, pz + rr * .85 * Math.sin(a)));
    }
    if (pts.some(p => !p)) return;
    path(pts);
    ctx.fillStyle = flavor.pud; ctx.fill();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.2; ctx.stroke();
    // petit reflet sur la flaque
    const c = P(px - r * .3, py, pz - r * .2);
    if (c){ ctx.beginPath(); ctx.ellipse(c[0], c[1], F * r * .18 / c[2], F * r * .05 / c[2], 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fill(); }
}
function iceCream(i, x, y, z, t){
    const layout = LAYOUTS[[3, 0, 5, 2, 7, 1, 4, 6, 2, 0, 5, 3][i % 12] % LAYOUTS.length];
    // chaque assiette tourne sa composition et la décale un peu
    const th = hash(i * 2.13 + .3) * Math.PI * 2, co = Math.cos(th), si = Math.sin(th);
    const jx = (hash(i * 4.7) - .5) * .16, jz = (hash(i * 6.1) - .5) * .16;
    const pos = layout.map(([dx, dz]) => {
        let rx = dx * co - dz * si + jx, rz = dx * si + dz * co + jz;
        const d = Math.hypot(rx, rz), lim = .5;
        if (d > lim){ rx *= lim / d; rz *= lim / d; }       // reste sur l'assiette
        return [rx, rz];
    });
    // profondeur de chaque boule : celle de sa base pour les boules posées dessus
    const depth = k => {
        const e = layout[k];
        if (e[3] === undefined) return pos[k][1];
        return Math.min(depth(e[3]), e[4] !== undefined ? depth(e[4]) : Infinity) - .001 * (k + 1);
    };
    const order = layout.map((_, k) => k).sort((a, b) => depth(b) - depth(a));

    const placed = [];
    for (const k of order){
        const [, , size, on, on2] = layout[k];
        // parfums différents sur une même assiette, ordre qui change d'une assiette à l'autre
        const fl = FLAVORS[(i * 3 + k * (1 + (i % 3 === 2 ? 2 : 0)) + Math.floor(hash(i) * 4)) % FLAVORS.length];
        const seed = i * 13 + k;
        let cx, yb, w;
        if (on === undefined){
            const [rx, rz] = pos[k];
            const b = P(x + rx, y, z + rz);
            if (!b) continue;
            w = SCOOP_W * size * F / b[2];
            // ombre de contact, et flaque si la boule fond
            const sh = ring(x + rx + .03, y + .004, z + rz + .02, SCOOP_W * size * .55, 32);
            if (!sh.some(p => !p)){ path(sh); ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fill(); }
            if (params(seed).kind === 'fondue') puddle(x + rx, y + .006, z + rz, SCOOP_W * size * .58, fl, seed, t);
            cx = b[0]; yb = b[1] + w * .03;
        } else {
            const base = placed[on], base2 = on2 !== undefined ? placed[on2] : null;
            if (!base) continue;
            const bw = base2 ? (base.w + base2.w) / 2 : base.w;
            w = SCOOP_W * size * bw / (SCOOP_W * (base2 ? (layout[on][2] + layout[on2][2]) / 2 : layout[on][2]));
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
function drawPlates(t){
    const z = (BELT.z0 + BELT.z1) / 2;
    const items = [];
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
    if (!s.some(p => !p)){
        path(s); ctx.fillStyle = '#101010'; ctx.fill(); ctx.strokeStyle = line(.7); ctx.stroke();
        path(ring(3.0, y + .021, z, .3)); ctx.fillStyle = '#2a0a07'; ctx.fill();
    }
    // tasse de thé
    cylinder(5.4, y, y + .46, z - .1, .22, '#141414', '#0e0e0e', line(.65));
    const lip = ring(5.4, y + .461, z - .1, .17);
    if (!lip.some(p => !p)){ path(lip); ctx.fillStyle = '#3a3a2a'; ctx.fill(); }
}

// ---------- Rendu ----------
let BELT_OFFSET = 0;
function render(t){
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
    // assiettes et crème glacée : en 3D si possible, sinon dessin 2D de secours
    if (typeof ICE_CREAM !== 'undefined' && ICE_CREAM){ if (COUNTER_SHOW > 0) ICE_CREAM.render(t); }
    else if (typeof THREE === 'undefined' && COUNTER_SHOW > 0) drawPlates(t);
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
const ease = t => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;

// ---------- Comptoir et tapis pilotables (passage accueil <-> salons) ----------
let BELT_D = null, LAST_T = 0, COUNTER_SHOW = window.INITIAL_VIEW === 'rooms' ? 0 : 1;
const beltPos = t => BELT_D === null ? t * BELT.speed : BELT_D;
const BELT_ACC = 32;
const beltDistance = s => BELT.speed * (s + BELT_ACC * s * s * s / 3);
// le tapis s'élance (vers la droite) en accélérant
window.SCENE_BELT_LEAVE = (ms, onStep, onDone) => {
    const D0 = beltPos(LAST_T) + BELT_OFFSET, t0 = performance.now();
    BELT_OFFSET = 0;
    const step = now => {
        const s = Math.min(ms, now - t0) / 1000;
        BELT_D = D0 + beltDistance(s);
        onStep && onStep((now - t0) / ms);
        if (now - t0 < ms) requestAnimationFrame(step); else onDone && onDone();
    };
    requestAnimationFrame(step);
};
// le tapis arrive lancé (dist < 0 : vers la gauche) et ralentit jusqu'à reprendre son rythme
window.SCENE_BELT_ARRIVE = (dist, ms, onStep, onDone) => {
    const t0 = performance.now(), D1 = beltPos(LAST_T) + BELT_OFFSET + dist;
    BELT_OFFSET = 0;
    const step = now => {
        const k = Math.min(1, (now - t0) / ms), remaining = dist * (1 - k) * (1 - k);
        BELT_D = D1 - remaining;
        onStep && onStep(k);
        if (k < 1) requestAnimationFrame(step);
        else { const end = BELT_D; BELT_D = null; BELT_OFFSET = end - LAST_T * BELT.speed; onDone && onDone(); }
    };
    requestAnimationFrame(step);
};
window.SCENE_COUNTER = (targetLevel, ms) => {
    const c0 = COUNTER_SHOW, t0 = performance.now();
    const step = now => { const k = Math.min(1, (now - t0) / ms); COUNTER_SHOW = c0 + (targetLevel - c0) * k * k * (3 - 2 * k); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
};

resize();
addEventListener('resize', () => { resize(); if (reduce) render(0); });

if (reduce){
    render(0);
} else {
    let t0 = null;
    const frame = now => {
        if (t0 === null) t0 = window.INITIAL_VIEW === 'rooms' ? now - DURATION : now + DELAY;
        const s = (now - t0) / 1000;
        const k = ease(Math.min(1, Math.max(0, s * 1000 / DURATION)));
        const idle = Math.max(0, s - DURATION / 1000);
        const settle = Math.min(1, idle / 2);
        cam.z = START_Z * (1 - k);
        cam.x = Math.sin(idle * .2) * .35 * settle;
        cam.y = Math.sin(idle * .14 + 1) * .15 * settle;
        render(Math.max(0, s));
        requestAnimationFrame(frame);
    };
    cam.z = window.INITIAL_VIEW === 'rooms' ? 0 : START_Z;
    render(0);
    requestAnimationFrame(frame);
}

// ================= Assiettes et crème glacée en vraie 3D (Three.js) =================
// Une couche WebGL transparente est posée sur le décor. Sa caméra reprend
// exactement celle du décor (même position, même focale), donc les deux
// couches restent alignées. Les boules sont de vrais volumes déformés,
// éclairés en cel-shading (aplats de lumière et d'ombre, trame de points dans
// l'ombre, reflet) avec un contour noir ; celles qui fondent se déforment
// réellement image par image.
var ICE_CREAM = null;
(function(){
    if (typeof THREE === 'undefined') return;                 // repli : dessin 2D
    const glCanvas = document.getElementById('ice-cream');
    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ canvas: glCanvas, alpha: true, antialias: true });
    } catch (e) { return; }
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, .3, 200);
    // le décor compte z vers le fond ; Three.js compte z vers nous
    const V = (x, y, z) => new THREE.Vector3(x, y, -z);

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

    const col = h => new THREE.Color(h);
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
    const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

    function shapeScoop(geo, base, p, t, stacked){
        const pos = geo.attributes.position.array;
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
            const ux = base[i], uy = base[i + 1], uz = base[i + 2];
            const th = Math.atan2(uz, ux), sXZ = Math.sqrt(ux * ux + uz * uz);
            let b = 1;
            for (let k = 0; k < p.harm.length; k++){
                const h = p.harm[k];
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
                rad *= 1 + .08 * f + p.waveAmp * 1.4 * f * Math.sin(p.waves * th + p.harm[0].p);
                y -= f * p.waveAmp * .9 * (1 + Math.sin(p.waves * th + p.harm[0].p));
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
            if (p.tilt){ pos[i] += p.tilt * Math.max(0, uy) * Ry; }
        }
        geo.attributes.position.needsUpdate = true;
        geo.computeVertexNormals();
        geo.computeBoundingBox();
    }

    function sphereMerged(){
        const src = new THREE.SphereGeometry(.5, 64, 44);
        const a = src.attributes.position.array, idx = src.index.array;
        const map = new Map(), pos = [], remap = new Uint32Array(a.length / 3);
        for (let i = 0; i < a.length / 3; i++){
            const key = Math.round(a[i*3] * 1e4) + ',' + Math.round(a[i*3+1] * 1e4) + ',' + Math.round(a[i*3+2] * 1e4);
            if (!map.has(key)){ map.set(key, pos.length / 3); pos.push(a[i*3], a[i*3+1], a[i*3+2]); }
            remap[i] = map.get(key);
        }
        const out = [];
        for (let k = 0; k < idx.length; k += 3){
            const A = remap[idx[k]], B = remap[idx[k+1]], C = remap[idx[k+2]];
            if (A !== B && B !== C && A !== C) out.push(A, B, C);      // retire les triangles écrasés des pôles
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setIndex(out);
        return g;
    }

    // ---------- Flaque ----------
    function puddleGeo(seed, r){
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
    const plates = [];
    const animated = [];

    for (let i = 0; i < PLATES; i++){
        const g = new THREE.Group();
        scene.add(g);
        const disc = new THREE.Mesh(plateGeo, plateMat);
        disc.position.y = plateTop - .03;
        g.add(disc);
        const rim = new THREE.Mesh(i % 3 === 1 ? ringOuterRed : ringOuter, i % 3 === 1 ? rimRed : rimWhite);
        rim.position.y = plateTop + .002; g.add(rim);
        const inn = new THREE.Mesh(ringInner, innerRing); inn.position.y = plateTop + .002; g.add(inn);

        // composition : la même logique de placement que la version 2D
        const layout = LAYOUTS[[3, 0, 5, 2, 7, 1, 4, 6, 2, 0, 5, 3][i % 12] % LAYOUTS.length];
        const th = hash(i * 2.13 + .3) * Math.PI * 2, co = Math.cos(th), si = Math.sin(th);
        const jx = (hash(i * 4.7) - .5) * .16, jz = (hash(i * 6.1) - .5) * .16;
        const pos = layout.map(([dx, dz]) => {
            let rx = dx * co - dz * si + jx, rz = dx * si + dz * co + jz;
            const d = Math.hypot(rx, rz), lim = .48;
            if (d > lim){ rx *= lim / d; rz *= lim / d; }
            return [rx, rz];
        });
        const placed = [];
        // les bases d'abord, puis ce qui est posé dessus
        const order = layout.map((_, k) => k).sort((a, b) => (layout[a].length > 3) - (layout[b].length > 3));
        for (const k of order){
            const [, , size, on, on2] = layout[k];
            const fi = (i * 3 + k * (1 + (i % 3 === 2 ? 2 : 0)) + Math.floor(hash(i) * 4)) % PALETTE.length;
            const seed = i * 13 + k;
            const p = params(seed);
            const stacked = on !== undefined;

            const geo = sphereMerged();
            const base = Float32Array.from(geo.attributes.position.array).map(v => v * 2);   // directions unitaires
            shapeScoop(geo, base, p, 0, stacked);
            const mesh = new THREE.Mesh(geo, toonMats[fi]);
            const line = new THREE.Mesh(geo, outlineMat);
            mesh.add(line);
            mesh.scale.setScalar(size);
            mesh.rotation.y = hash(seed * 3.3) * Math.PI * 2;      // chaque boule tournée différemment
            g.add(mesh);
            const bb = geo.boundingBox;

            let x, y, z;
            if (!stacked){
                [x, z] = pos[k];
                y = plateTop - bb.min.y * size;
                // ombre de contact
                const sh = new THREE.Mesh(shadowGeo, shadowMat);
                sh.scale.setScalar(size * 1.05);
                sh.position.set(x + .03, plateTop + .004, -(z + .02));
                g.add(sh);
                // flaque si elle fond
                if (p.kind === 'fondue'){
                    const pg = puddleGeo(seed, .56 * size);
                    const pm = new THREE.Mesh(pg, pudMats[fi]);
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
                const b1 = placed[on], b2 = on2 !== undefined ? placed[on2] : null;
                x = b2 ? (b1.x + b2.x) / 2 : b1.x;
                z = b2 ? (b1.z + b2.z) / 2 : b1.z;
                const topOf = b => b.y + b.top * b.size;
                const support = b2 ? (topOf(b1) + topOf(b2)) / 2 - .12 : topOf(b1) - .16 * b1.size;
                y = support - bb.min.y * size * .55;
            }
            mesh.position.set(x, y, -z);
            placed[k] = { x, y, z, size, top: bb.max.y };
            if (p.kind === 'fondue') animated.push({ kind: 'scoop', geo, base, p, stacked });
        }
        plates.push({ g, i });
    }

    // ---------- Rendu, synchronisé avec la caméra du décor ----------
    function resize3d(){
        renderer.setPixelRatio(DPR);
        renderer.setSize(W, H, false);
        for (const m of toonMats) m.uniforms.uDpr.value = DPR;
        camera.aspect = W / H;
        camera.fov = 2 * Math.atan((H / 2) / F) * 180 / Math.PI;
        camera.updateProjectionMatrix();
    }
    function render3d(t){
        camera.position.set(cam.x, cam.y, -cam.z);
        for (const { g, i } of plates){
            const x = ((i * GAP + (reduce ? 0 : beltPos(t) + BELT_OFFSET)) % LOOP) - LOOP / 2;
            g.position.set(x, 0, -beltZ);
            g.visible = Math.abs(x - cam.x) < 22;
        }
        if (!reduce){
            for (const a of animated){
                if (a.kind === 'scoop') shapeScoop(a.geo, a.base, a.p, t, a.stacked);
                else a.obj.scale.setScalar(1 + .12 * (.5 + .5 * Math.sin(t * .3 + a.seed)));
            }
        }
        renderer.render(scene, camera);
    }
    resize3d();
    ICE_CREAM = { render: render3d, resize: resize3d };
    if (reduce) render(0);
})();

// ================= Vue des salons =================
const ROOMS = (() => {
const t = (key, options) => i18n.t('rooms.' + key, options);
const rooms = [
    { n: 1, serial: '1305', lang: 'fr', guests: '2 / 4', bots: true },
    { n: 2, serial: '1305', lang: 'en', guests: '5 / 6', bots: false },
    { n: 3, serial: '1305', lang: 'fr', guests: '1 / 2', bots: true },
    { n: 4, serial: '1305', lang: 'en', guests: '3 / 8', bots: false },
];

let taken = -1;

// ---------- Coupons ----------
const zone = document.getElementById('tickets');
zone.innerHTML = rooms.map((r, i) => `
    <div class="ticket" data-i="${i}">
        <div class="ticket-paper">
            <span class="ticket-hole" aria-hidden="true"></span>
            <span class="ticket-stamp" aria-hidden="true"><span></span></span>
            <div class="ticket-header" data-k="reservation"></div>
            <div class="ticket-num">
                <span class="ticket-number" aria-hidden="true">${String(r.n).padStart(2, '0')}</span>
                <span class="ticket-table"></span>
                <span class="ticket-serial"></span>
            </div>
            <div class="ticket-rows">
                <div class="ticket-row"><span class="ticket-label" data-k="lang"></span><span class="ticket-value v-lang"></span></div>
                <div class="ticket-row"><span class="ticket-label" data-k="guests"></span><span class="ticket-value">${r.guests}</span></div>
                <div class="ticket-row"><span class="ticket-label" data-k="bots"></span><span class="ticket-value v-bots${r.bots ? ' yes' : ''}"></span></div>
            </div>
            <div class="ticket-perforation" aria-hidden="true"></div>
            <div class="ticket-stub">
                <div class="ticket-stub-header"><span data-k="stub"></span><span class="ticket-dot" aria-hidden="true"></span></div>
                <button class="ticket-button" type="button"><span class="ticket-button-text"></span></button>
            </div>
        </div>
    </div>`).join('');

function updateCoupons(){
    zone.querySelectorAll('.ticket').forEach(el => {
        const i = +el.dataset.i, r = rooms[i], on = taken === i;
        el.querySelectorAll('[data-k]').forEach(n => n.textContent = t(n.dataset.k));
        el.querySelector('.ticket-table').textContent = t('table') + ' ' + r.n;
        el.querySelector('.ticket-serial').textContent = t('serial') + ' ' + r.serial;
        el.querySelector('.v-lang').textContent = t(r.lang === 'fr' ? 'codeFr' : 'codeEn');
        el.querySelector('.v-bots').textContent = t(r.bots ? 'yes' : 'no');
        el.querySelector('.ticket-stamp span').textContent = t('reserved');
        el.classList.toggle('taken', on);
        const b = el.querySelector('.ticket-button');
        b.setAttribute('aria-label', t('takeLabel', { n: r.n, guests: r.guests }));
        b.querySelector('.ticket-button-text').textContent = t('take');
    });
}
// ---------- Survol des tickets : ressort amorti qui suit la souris ----------
(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const bodies = [...zone.querySelectorAll('.ticket')].map(el => ({
        el, p: el.querySelector('.ticket-paper'),
        th: 0, w: 0,            // balancement (radians) et sa vitesse
        ry: 0, vry: 0,          // légère rotation 3D du papier
        lift: 0, hovered: false,
    }));
    let lastX = null, lastT = 0;
    zone.addEventListener('pointermove', e => {
        const now = performance.now();
        if (lastX !== null && now - lastT < 80){
            const vx = (e.clientX - lastX) / Math.max(8, now - lastT);   // px / ms
            const el = e.target.closest('.ticket');
            const c = el && bodies[+el.dataset.i];
            if (c){
                c.w += Math.max(-1.2, Math.min(1.2, vx)) * .09;
                c.vry += Math.max(-1.2, Math.min(1.2, vx)) * 7;
            }
        }
        lastX = e.clientX; lastT = now;
    });
    zone.addEventListener('pointerleave', () => { lastX = null; });
    bodies.forEach(c => {
        c.el.addEventListener('pointerenter', () => { c.hovered = true; });
        c.el.addEventListener('pointerleave', () => { c.hovered = false; });
    });
    let prev = performance.now();
    const step = now => {
        const dt = Math.min(.033, (now - prev) / 1000);
        prev = now;
        for (const c of bodies){
            // ressort souple et bien amorti : quelques oscillations qui s'éteignent
            c.w += (-14 * c.th - 2.6 * c.w) * dt;
            c.th = Math.max(-.12, Math.min(.12, c.th + c.w * dt));
            c.vry += (-22 * c.ry - 4.2 * c.vry) * dt;
            c.ry = Math.max(-14, Math.min(14, c.ry + c.vry * dt));
            c.lift += ((c.hovered ? -4 : 0) - c.lift) * Math.min(1, dt * 7);
            if (Math.abs(c.th) + Math.abs(c.w) + Math.abs(c.ry) + Math.abs(c.vry) + Math.abs(c.lift) > .002){
                c.p.style.transform = `translateY(${c.lift.toFixed(2)}px) rotate(${c.th.toFixed(4)}rad) rotateY(${c.ry.toFixed(2)}deg)`;
            } else if (c.p.style.transform){
                c.p.style.transform = '';
            }
        }
        requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
})();

// ---------- Prendre un ticket : le talon s'envole, puis salle d'attente ----------
const WAITING_PAGE = 'room.html';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
zone.addEventListener('click', e => {
    const b = e.target.closest('.ticket-button');
    if (!b || taken >= 0) return;
    const i = +b.closest('.ticket').dataset.i;
    taken = i;
    zone.classList.add('locked');
    const el = b.closest('.ticket'), paper = el.querySelector('.ticket-paper'), stub = el.querySelector('.ticket-stub');
    // copie du talon, posée exactement au même endroit, qui va s'envoler
    const u = el.querySelector('.ticket-hole').offsetWidth / 6;
    const box = stub.getBoundingClientRect(), pr = paper.getBoundingClientRect();
    const flyingStub = stub.cloneNode(true);
    flyingStub.className = 'ticket-stub ticket-stub-flying';
    flyingStub.style.setProperty('--u', u + 'px');
    Object.assign(flyingStub.style, { left: pr.left + 'px', top: box.top + 'px', width: pr.width + 'px' });
    if (reducedMotion) flyingStub.style.animation = 'none', flyingStub.style.opacity = 0;
    document.body.appendChild(flyingStub);
    // le ticket est coupé net à la perforation
    paper.style.clipPath = `inset(-20px -20px ${paper.offsetHeight - stub.offsetTop}px -20px)`;
    updateCoupons();
    const r = rooms[i];
    setTimeout(() => {
        const [present, max] = r.guests.split(' / ');
        location.href = `${WAITING_PAGE}?table=${r.n}&serial=${r.serial}&lang=${r.lang}&guests=${max}&present=${present}&bots=${r.bots ? 1 : 0}`;
    }, reducedMotion ? 500 : 1700);
});

// ---------- Langue ----------
i18n.on('languageChanged', updateCoupons);
updateCoupons();

return { coupons: () => [...document.querySelectorAll('.ticket')] };
})();

// ================= Passage accueil <-> salons, dans la même page =================
// Le tapis emporte la crème glacée vers la droite pendant que les tickets descendent
// du plafond ; au retour, les tickets remontent et le tapis ramène la crème glacée
// en roulant vers la gauche. Pas de changement de page : rien ne fige ni ne clignote.
const root = document.documentElement, homeEl = document.querySelector('.home'), panelEl = document.querySelector('.panel');
const langTabsEl = document.querySelector('.hanging-tabs'), backEl = document.querySelector('.hanging-button');
const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let view = 'home', pendingTimer = null;
function setIceCreamOpacity(o){ const g = document.getElementById('ice-cream'); if (g) g.style.opacity = o; }
function showRooms(animate){
    if (view === 'rooms') return; view = 'rooms';
    clearTimeout(pendingTimer);
    const coupons = ROOMS.coupons();
    coupons.forEach(c => { c.style.transition = ''; c.style.transform = ''; c.style.opacity = ''; c.classList.remove('descend'); });
    if (!animate || prefersReducedMotion()){
        root.classList.add('rooms-view');
        if (window.SCENE_COUNTER) { window.SCENE_COUNTER(0, 1); } setIceCreamOpacity(0);
        panelEl.style.opacity = '0';
        return;
    }
    // le menu s'efface
    panelEl.style.animation = 'none';
    panelEl.style.transition = 'opacity .3s ease-in, transform .35s ease-in';
    panelEl.style.opacity = '0'; panelEl.style.transform = 'translateY(2vh) scale(.98)';
    homeEl.classList.add('leaving');
    root.classList.add('rooms-view');
    void root.offsetWidth;
    // les tickets descendent du plafond, en même temps que le tapis emporte la crème glacée
    coupons.forEach(c => c.classList.add('descend'));
    backEl.style.opacity = '0'; backEl.style.transition = 'opacity .4s .6s';
    requestAnimationFrame(() => { backEl.style.opacity = ''; });
    window.SCENE_BELT_LEAVE(800, k => setIceCreamOpacity(Math.max(0, 1 - Math.max(0, k - .3) / .6)), () => {
        const v = BELT.speed * (1 + BELT_ACC * .64), BRAKE_MS = 500;
        window.SCENE_BELT_ARRIVE(v * BRAKE_MS / 1000 / 2, BRAKE_MS, null, null);
    });
    pendingTimer = setTimeout(() => { window.SCENE_COUNTER(0, 600); }, 500);
    setTimeout(() => homeEl.classList.remove('leaving'), 400);
}
function showHome(animate){
    if (view === 'home') return; view = 'home';
    clearTimeout(pendingTimer);
    const coupons = ROOMS.coupons();
    const finish = () => {
        root.classList.remove('rooms-view');
        coupons.forEach(c => { c.style.transition = ''; c.style.transform = ''; c.style.opacity = ''; c.classList.remove('descend'); });
    };
    if (!animate || prefersReducedMotion()){
        finish(); window.SCENE_COUNTER(1, 1); setIceCreamOpacity(1);
        panelEl.style.opacity = ''; panelEl.style.transform = '';
        return;
    }
    // les tickets remontent le long de leurs fils
    backEl.style.transition = 'opacity .25s'; backEl.style.opacity = '0';
    coupons.forEach((c, i) => {
        c.classList.remove('descend');
        c.style.transition = `transform .6s ${(3 - i) * .05}s cubic-bezier(.55,0,.75,.4), opacity .2s ${.4 + (3 - i) * .05}s`;
        requestAnimationFrame(() => { c.style.transform = 'translateY(-90vh)'; c.style.opacity = '0'; });
    });
    // le comptoir revient, et le tapis ramène la crème glacée en roulant vers la gauche
    window.SCENE_COUNTER(1, 500);
    setIceCreamOpacity(0);
    setTimeout(() => window.SCENE_BELT_ARRIVE(-14, 950, k => setIceCreamOpacity(Math.min(1, k / .35)), null), 150);
    // puis le menu réapparaît
    setTimeout(() => {
        homeEl.classList.add('leaving');
        panelEl.style.transition = 'opacity .45s ease-out, transform .5s cubic-bezier(.2,.8,.2,1)';
        panelEl.style.opacity = ''; panelEl.style.transform = '';
    }, 650);
    pendingTimer = setTimeout(() => { finish(); homeEl.classList.remove('leaving'); backEl.style.opacity = ''; backEl.style.transition = ''; }, 900);
}
function syncWithHash(animate){ (location.hash === '#rooms' ? showRooms : showHome)(animate); }
addEventListener('hashchange', () => syncWithHash(true));
if (window.INITIAL_VIEW === 'rooms') showRooms(false);
