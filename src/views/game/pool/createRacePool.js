// Le bassin de la course : un couloir par joueur, avec son tuyau, son poisson et sa tour de glace.
// createRacePool construit les couloirs dans `root` et renvoie de quoi les piloter,
// ainsi que destroy() pour tout arrêter (appelé quand le composant React est démonté).
import M from 'matter-js';
import fishHalfOpenUrl from '../../../assets/game/fish-half-open.png';
import fishOpenUrl from '../../../assets/game/fish-open.png';
import pipeUrl from '../../../assets/game/pipe.png';

const SCOOP_SHARE = 0.2;        // une boule de glace par tranche de 20 % du texte (5 boules par course)

function preparePipeMask() {
  const img = new Image();
  img.onload = () => {
    const w = img.width, H = 140, c = document.createElement('canvas');
    c.width = w; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const im = ctx.getImageData(0, 0, w, img.height), a = (x, y) => im.data[(y * w + x) * 4 + 3];
    for (let f = 0; f < 6; f++) {
      const y0 = f * H, outside = new Uint8Array(w * H), stack = [];
      const visit = (x, y) => {
        if (x < 0 || x >= w || y < 0 || y >= H || outside[y * w + x] || a(x, y0 + y) >= 128) return;
        outside[y * w + x] = 1; stack.push(x, y);
      };
      // le haut de l'image n'est pas un départ : le corps du tuyau y est ouvert
      for (let y = 0; y < H; y++) { visit(0, y); visit(w - 1, y); }
      for (let x = 0; x < w; x++) visit(x, H - 1);
      while (stack.length) { const y = stack.pop(), x = stack.pop(); visit(x + 1, y); visit(x - 1, y); visit(x, y + 1); visit(x, y - 1); }
      for (let y = 0; y < H; y++) for (let x = 0; x < w; x++) if (!outside[y * w + x]) im.data[((y0 + y) * w + x) * 4 + 3] = 255;
    }
    ctx.putImageData(im, 0, 0);
    document.documentElement.style.setProperty('--pipe-mask', 'url(' + c.toDataURL() + ')');
  };
  img.src = pipeUrl;
}

function fillHead(src) {
  return new Promise((ok) => {
    const img = new Image();
    img.onerror = () => ok(src);
    img.onload = () => {
      const W = img.width, H = img.height;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
      const im = ctx.getImageData(0, 0, W, H), d = im.data, outside = new Uint8Array(W * H), stack = [];
      const visit = (x, y) => {
        const k = y * W + x;
        if (x >= 0 && y >= 0 && x < W && y < H && !outside[k] && d[k * 4 + 3] < 128) { outside[k] = 1; stack.push(k); }
      };
      // on part du haut et des côtés : le bas de l'image coupe le corps, l'intérieur y touche le bord
      for (let x = 0; x < W; x++) visit(x, 0);
      for (let y = 0; y < H; y++) { visit(0, y); visit(W - 1, y); }
      while (stack.length) {
        const k = stack.pop(), x = k % W, y = (k - x) / W;
        visit(x - 1, y); visit(x + 1, y); visit(x, y - 1); visit(x, y + 1);
      }
      for (let k = 0; k < W * H; k++) {
        const a = d[k * 4 + 3];
        if (outside[k] || a === 255) continue;
        for (let n = 0; n < 3; n++) d[k * 4 + n] = Math.round((d[k * 4 + n] * a + 255 * (255 - a)) / 255);
        d[k * 4 + 3] = 255;
      }
      ctx.putImageData(im, 0, 0);
      ok(c.toDataURL());
    };
    img.src = src;
  });
}

// le cou : la dernière rangée de pixels de la tête, étirée (une par image de gueule, pour que le raccord reste juste)
function prepareNecks(fish) {
  fish.forEach((src, i) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = 1;
      c.getContext('2d').drawImage(img, 0, img.height - 1, img.width, 1, 0, 0, img.width, 1);
      document.documentElement.style.setProperty('--neck' + i, 'url(' + c.toDataURL() + ')');
    };
    img.src = src;
  });
}

let loading = null;
/** Prépare une seule fois les images du bassin (têtes remplies, masque du tuyau, cous). */
export function loadRacePoolImages() {
  if (!loading) {
    preparePipeMask();
    loading = Promise.all([fishHalfOpenUrl, fishOpenUrl].map(fillHead)).then((fish) => {
      prepareNecks(fish);
      return { fish, pipe: pipeUrl };
    });
  }
  return loading;
}

/**
 * @param {HTMLElement} root
 * @param {{ players: { me?: boolean }[], images: { fish: string[], pipe: string } }} options
 */
export function createRacePool(root, { players, images }) {
  let lanes = [];
  function serve(id, fraction) {
    const lane = lanes[id];
    if (!lane) return;
    // une boule par tranche de SCOOP_SHARE du texte franchie
    const due = Math.min(SCOOP_COUNT, Math.floor(fraction / SCOOP_SHARE + 1e-6));
    while (lane.launched < due) { lane.launched++; pushScoop(lane); }
  }

  // Chaque boule est un anneau de particules relié par des ressorts à un noyau (un moteur Matter.js par couloir).
  // Pour qu'elle se comporte comme de la vraie glace et non comme du slime :
  //  · aucun rebond, frottement fort, aucun tremblement (amortissement interne) ;
  //  · plasticité : les ressorts adoptent peu à peu la forme écrasée, la boule ne reprend pas sa forme ;
  //  · volume conservé : sous le poids elle s'aplatit et s'élargit au lieu de se comprimer ;
  //  · adhérence : une boule posée colle à celle du dessous ou à la tête, comme une pile de cornet.
  const FLAVORS = [
    // palette de l'accueil : [lumière, éclat, ombre, demi-teinte, trame]
    ['#8b3cf0', '#d8c2ff', '#5419b0', '#7429dc', '#3a0c86'],   // violet
    ['#b0407f', '#f3b9dc', '#741f50', '#962f69', '#4f0f34'],   // prune
    ['#fff27e', '#ffffff', '#d9b82c', '#f3dc52', '#9a7d0e'],   // citron
    ['#ff8f40', '#ffe0c8', '#cc5512', '#f07224', '#8a3200']    // orange
  ];
  // contour plein de la tête (pixels de l'image 360 × 240), gueule grande ouverte, relevé sur le bord intérieur des mâchoires : le creux du V est la gueule
  const HEAD = [[40, 240], [12, 80], [25, 90], [45, 103], [65, 114], [85, 122], [105, 129], [125, 134], [148, 139],
    [165, 130], [185, 117], [205, 105], [225, 94], [245, 84], [265, 75], [285, 67], [305, 60], [328, 56], [336, 240]];
  const MOUTH_BOTTOM = 8, RIGHT_JAW = HEAD.length - 2;   // creux du V, pointe de la mâchoire droite
  const MOUTH = [148, 150];
  const G = 2200, STEP = 1 / 120, RING_SIZE = 18, S0 = 0.3;
  const YIELD = 0.02, CREEP = 0.06, VOLUME = 0.8, DAMPING = 0.75;   // plasticité, conservation du volume, amortissement interne
  const SCOOP_COUNT = Math.round(1 / SCOOP_SHARE);
  let rafId = null, lastTime = 0, leftover = 0;
  const halftones = {};

  function geometry(lane) {
    const el = lane.el, fish = lane.fish, pipe = lane.pipe;
    const W = el.clientWidth, H = el.clientHeight, fw = fish.offsetWidth;
    if (!fw || !H) return null;
    const k = fw / 360, fx = W / 2 - fw / 2, fy = H - 240 * k, exit = pipe.offsetHeight * 0.9;
    // boules à la largeur de la gueule (la tête reste visible), réduites pour que la tour complète tienne sous le tuyau :
    // aucune boule n'est avalée ; les coulures recouvrent la boule du dessous, chacune ajoute ~1,15 R à la tour
    const R = Math.min(fw * 0.4, (fy + HEAD[1][1] * k - exit) / (SCOOP_COUNT * 1.15));
    return { W, H, fw, k, fx, fy, exit, R, top: pipe.offsetHeight,
      head: HEAD.map(([x, y]) => [fx + x * k, fy + y * k]),
      mouth: [fx + MOUTH[0] * k, fy + MOUTH[1] * k] };
  }

  function isInside(pt, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }

  // décor statique : sol, murs du couloir et tête du poisson.
  // Reconstruit quand le couloir change de taille.
  function buildStatics(lane, g) {
    if (!lane.engine) {
      lane.engine = M.Engine.create({ positionIterations: 10, velocityIterations: 6, constraintIterations: 4 });
      lane.engine.gravity.scale = G / 1e6;
      lane.glued = [];
    }
    const key = g.W + 'x' + g.H + 'x' + g.fw;
    if (lane.key === key) return;
    const previous = lane.key;
    lane.key = key;
    if (lane.statics) M.Composite.remove(lane.engine.world, lane.statics);
    const opt = { isStatic: true, friction: 0.9, frictionStatic: 1, restitution: 0 };
    const E = Math.max(60, g.W);
    lane.statics = [
      M.Bodies.rectangle(g.W / 2, g.H + E / 2, g.W + 2 * E, E, opt),
      M.Bodies.rectangle(-E / 2, -g.H / 2, E, g.H * 4, opt),
      M.Bodies.rectangle(g.W + E / 2, -g.H / 2, E, g.H * 4, opt)
    ];
    // la tête découpée en triangles convexes : chaque segment des mâchoires relié à sa base, puis le fond de la gueule
    const T = g.head, n = T.length - 1, tris = [[T[0], T[MOUTH_BOTTOM], T[n]]];
    for (let i = 1; i < n - 1; i++) tris.push([T[i], T[i + 1], i < MOUTH_BOTTOM ? T[0] : T[n]]);
    tris.forEach((tri) => {
      const v = tri.map(([x, y]) => ({ x, y }));
      lane.statics.push(M.Bodies.fromVertices((v[0].x + v[1].x + v[2].x) / 3, (v[0].y + v[1].y + v[2].y) / 3, [v],
        Object.assign({ head: true }, opt)));
    });
    M.Composite.add(lane.engine.world, lane.statics);
    // redimensionnement en cours de partie : la tour suit la gueule, aucune boule ne disparaît
    if (previous && lane.anchor) {
      const dx = g.mouth[0] - lane.anchor[0], dy = g.mouth[1] - lane.anchor[1];
      lane.scoops.forEach((b) => partsOf(b).forEach((p) => M.Body.translate(p, { x: dx, y: dy })));
      lane.glued.forEach((c) => { if (!c.bodyB) { c.pointB.x += dx; c.pointB.y += dy; } });
    }
    lane.anchor = g.mouth;
  }

  const partsOf = (b) => [b.core].concat(b.ring);
  const area = (P) => {
    let A = 0;
    for (let i = 0; i < P.length; i++) { const a = P[i], c = P[(i + 1) % P.length]; A += a.x * c.y - c.x * a.y; }
    return Math.abs(A / 2);
  };

  // le tuyau : la boule le gonfle en descendant (images 1 à 3), sort pendant la 3e, puis il reprend sa forme (4, 5)
  const PIPE_FRAMES = [[1, 100], [2, 80], [3, 420], [4, 80], [5, 80], [0, 0]];
  const PIPE_EXIT_MS = 180;   // ms après le début : la boule commence à sortir au début de l'image 3
  const EXIT_TIME = 0.42;        // s : durée de l'image 3, la boule y est poussée hors de la bouche en grossissant
  const LIP_SWOLLEN = 0.5, LIP_REST = 0.9;   // hauteur de la bouche (part de la boîte) : image 3, puis tuyau au repos

  function pushScoop(lane) {
    lane.queued = (lane.queued || 0) + 1;
    if (!lane.pushing) cyclePipe(lane);
    clearTimeout(lane.timer); mouth(lane);   // la gueule s'ouvre tout de suite, avant que la boule sorte
  }

  // la gueule du poisson : [image, ms] ; elle s'ouvre grand dès qu'une boule arrive et ne bouge plus tant qu'elle en a une
  const MOUTH_FRAMES = [[0, 600], [1, 500]];
  function mouth(lane) {
    if (!lanes.includes(lane)) return;
    const busy = lane.pushing || lane.queued > 0 || lane.scoops.some((b) => b.state !== 'melting');
    const f = MOUTH_FRAMES[lane.step][0];
    let d;
    if (!busy) { lane.step = (lane.step + 1) % MOUTH_FRAMES.length; d = MOUTH_FRAMES[lane.step][1]; }
    else if (f < 1) { lane.step = 1; d = 90; }
    else d = 100;
    const src = images.fish[MOUTH_FRAMES[lane.step][0]];
    if (lane.fish.getAttribute('src') !== src) lane.fish.setAttribute('src', src);
    lane.el.style.setProperty('--neck', 'var(--neck' + MOUTH_FRAMES[lane.step][0] + ')');
    lane.timer = setTimeout(() => mouth(lane), d);
  }
  function cyclePipe(lane) {
    lane.queued--; lane.pushing = true;
    let t = 0;
    PIPE_FRAMES.forEach(([f, d]) => {
      setTimeout(() => { if (lanes.includes(lane)) lane.pipe.style.setProperty('--frame', f); }, t);
      t += d;
    });
    setTimeout(() => { if (lanes.includes(lane)) launchScoop(lane.id); }, PIPE_EXIT_MS);
    setTimeout(() => {
      lane.pushing = false;
      if (lane.queued > 0 && lanes.includes(lane)) cyclePipe(lane);
    }, t + 60);
  }

  function launchScoop(id) {
    const lane = lanes[id];
    if (!lane || !lane.canvas) return;
    const g = geometry(lane);
    if (!g || lane.scoops.length >= 7) return;
    buildStatics(lane, g);
    // chaque boule a son allure : plus large ou plus haute, penchée, festons plus ou moins marqués, plus ou moins coulante.
    // Toutes ont la même taille ; la première, posée dans la gueule, coule et s'étale peu : le poisson reste visible.
    const first = !lane.scoops.some((o) => o.state === 'falling');
    const rand = (a, c) => a + Math.random() * (c - a);
    const look = { large: first ? rand(1.06, 1.14) : rand(1.02, 1.1), dome: rand(0.62, 0.8), under: rand(0.48, 0.62), tilt: rand(-0.1, 0.1),
      scallop: rand(0.04, 0.08), scallopCount: 5 + Math.floor(Math.random() * 4),
      drip: first ? 0.2 : rand(0.8, 1.2), widen: first ? 0.2 : rand(0.6, 1.3) };
    const R = g.R * (first ? 1 : 0.88), rp = R * 0.14, ph = Math.random() * 6.3, rest = [];
    for (let i = 0; i < RING_SIZE; i++) {
      const a = (i / RING_SIZE) * Math.PI * 2;
      // dôme large, dessous plus plat, comme une boule déposée à la cuillère
      const r = (R - rp) * (1 + 0.05 * Math.sin(3 * a + ph) + 0.03 * Math.sin(5 * a + 2 * ph) + (Math.random() - 0.5) * 0.03);
      const y = Math.sin(a) * r * (Math.sin(a) > 0 ? look.under : look.dome);
      rest.push([Math.cos(a) * r * look.large - y * look.tilt, y]);
    }
    // la boule part cachée dans le tuyau, et à la fin de sa sortie son sommet est encore derrière la bouche : aucun vide
    const y0 = g.top * LIP_SWOLLEN - R * S0 * look.under;
    const y1 = g.top * LIP_REST + R * (look.dome + (first ? 0 : 0.24) - 0.1);
    const cx = (g.head[1][0] + g.head[RIGHT_JAW][0]) / 2, cy = y0;   // pile sur l'axe : la tour monte droit
    // les particules d'une même boule ne se heurtent pas entre elles (groupe négatif)
    const filter = { group: M.Body.nextGroup(true), category: 1, mask: 0xFFFFFFFF };
    const material = { collisionFilter: filter, friction: 0.9, frictionStatic: 1, frictionAir: 0.04, restitution: 0 };
    const core = M.Bodies.circle(cx, cy, R * 0.45 * S0, Object.assign({ density: 0.004 }, material));
    const ring = rest.map(([x, y]) => M.Bodies.circle(cx + x * S0, cy + y * S0, rp, Object.assign({ density: 0.002 }, material)));
    const links = [];
    const link = (a, b, raideur) => {
      const c = M.Constraint.create({ bodyA: a, bodyB: b, stiffness: raideur, damping: 0.4 });
      c.base = c.base0 = c.length / S0; c.skin = raideur === 1; links.push(c);
    };
    ring.forEach((p, i) => {
      link(p, ring[(i + 1) % RING_SIZE], 1);     // peau
      link(p, ring[(i + 2) % RING_SIZE], 0.95);  // résistance à la flexion
      link(p, ring[(i + 6) % RING_SIZE], 0.9);   // entretoise : la boule est dense, elle ne gondole pas
      link(core, p, 0.85);                        // rayon : s'affaisse sous son poids, se déforme et garde la déformation (plasticité)
    });
    [core].concat(ring).forEach((p) => M.Body.setVelocity(p, { x: 0, y: (y1 - y0) / EXIT_TIME / 60 }));
    const flavor = FLAVORS[Math.floor(Math.random() * FLAVORS.length)];
    // traînées de chute
    const trails = [];
    for (let i = 0, n = 2 + Math.floor(Math.random() * 3); i < n; i++) {
      trails.push({ u: Math.random() * 1.4 - 0.7, d: Math.random() * 0.35, l: 0.4 + Math.random() * 0.7, w: 0.1 + Math.random() * 0.1 });
    }
    // relief : bosses et creux de tailles variées, placés au hasard (pas de régularité)
    const bumps = [];
    for (let i = 0, n = 7 + Math.floor(Math.random() * 5); i < n; i++) {
      bumps.push({ th: Math.random() * 6.3, w: 0.12 + Math.random() * 0.35, h: (Math.random() < 0.7 ? 1 : -0.8) * (0.01 + Math.random() * 0.025) });
    }
    // coulures du bas : réparties sur le dessous avec un peu de hasard, quelques longues, la plupart courtes
    const drips = [];
    for (let i = 0, n = 3 + Math.floor(Math.random() * 3); i < n; i++) {
      const longDrip = Math.random() < 0.35;
      const [from, span] = first ? [0.14, 0.72] : [0.12, 0.76];
      drips.push({ th: Math.PI * (from + (span * (i + 0.5 + rand(-0.3, 0.3))) / n), w: rand(0.13, 0.22),
        l: (longDrip ? rand(0.3, 0.45) : rand(0.1, 0.22)) * (first ? 0.4 : 1) });
    }
    const lobes = [];
    for (let i = 0, n = 2 + Math.floor(Math.random() * 3); i < n; i++) {
      lobes.push({ a: -Math.PI / 2 + (Math.random() * 2 - 1) * 1.1, w: 0.15 + Math.random() * 0.2, h: 0.12 + Math.random() * 0.22 });
    }
    const b = { core, ring, links, rest, R, rp, y0, y1, first, look, drips, flavor, trails, bumps, lobes, vy: 0, area: area(rest.map(([x, y]) => ({ x, y }))),
      ph: [Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3],
      age: 0, s: S0, state: 'falling', t: 0, cx, cy, ang: 0 };
    [core].concat(ring).forEach((p) => { p.scoop = b; });
    M.Composite.add(lane.engine.world, [core].concat(ring, links));
    lane.scoops.push(b);
    // quelques gouttes qui s'échappent du tuyau avec la boule
    for (let i = 0, n = 2 + Math.floor(Math.random() * 3); i < n; i++) {
      lane.drops.push({ x: cx + (Math.random() * 2 - 1) * R * 0.6, y: cy + R * 0.1, vx: (Math.random() * 2 - 1) * 140,
        vy: -60 + Math.random() * 120, r: R * (0.07 + Math.random() * 0.09), flavor });
    }
    if (!rafId) { lastTime = performance.now(); rafId = requestAnimationFrame(scoopLoop); }
  }

  // plasticité : au-delà d'un petit seuil, la longueur de repos des rayons glisse vers la longueur actuelle
  // (la peau reste élastique pour garder un contour lisse)
  function applyPlasticity(b) {
    b.links.forEach((c) => {
      const spoke = c.bodyA === b.core;
      if (!spoke && (c.skin || !b.landed)) return;
      const pa = c.bodyA.position, pb = c.bodyB.position;
      const e = Math.hypot(pa.x - pb.x, pa.y - pb.y) / b.s - c.base, limit = c.base0 * YIELD;
      const [mini, maxi] = b.landed ? [0.82, 1.18] : [0.9, 1.1];
      if (Math.abs(e) > limit) c.base = Math.min(c.base0 * maxi, Math.max(c.base0 * mini, c.base + (e - Math.sign(e) * limit) * CREEP));
      c.length = c.base * b.s;
    });
  }

  // volume : on pousse la peau le long de ses normales pour retrouver l'aire de départ
  function keepVolume(b) {
    const P = b.ring.map((p) => ({ x: p.position.x, y: p.position.y })), n = P.length;
    let perimeter = 0;
    for (let i = 0; i < n; i++) perimeter += Math.hypot(P[(i + 1) % n].x - P[i].x, P[(i + 1) % n].y - P[i].y);
    const d = ((b.area * b.s * b.s - area(P)) / (perimeter || 1)) * VOLUME;
    if (Math.abs(d) < 0.01) return;
    b.ring.forEach((p, i) => {
      const a = P[(i + n - 1) % n], c = P[(i + 1) % n];
      let nx = c.y - a.y, ny = a.x - c.x;
      const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      if (nx * (P[i].x - b.cx) + ny * (P[i].y - b.cy) < 0) { nx = -nx; ny = -ny; }
      M.Body.translate(p, { x: nx * d, y: ny * d });
    });
  }

  // adhérence : la glace est collante, une particule de peau qui touche une autre boule ou la tête y reste collée
  function stick(lane, g) {
    lane.engine.pairs.list.forEach((pr) => {
      if (!pr.isActive) return;
      [[pr.bodyA, pr.bodyB], [pr.bodyB, pr.bodyA]].forEach(([p, q]) => {
        const b = p.scoop, o = q.scoop;
        if (!b || p === b.core || p.stuck || b.state !== 'falling' || b.age < EXIT_TIME) return;
        if (o ? (o === b || q === o.core || q.stuck || o.state !== 'falling') : !q.head) return;
        if (!o && (p.position.x < g.head[1][0] - b.rp * 2 || p.position.x > g.head[RIGHT_JAW][0] + b.rp * 2)) return;   // la tête ne colle que dans la gueule
        if (Math.hypot(p.velocity.x - q.velocity.x, p.velocity.y - q.velocity.y) > 8) return;
        if (lane.glued.filter((c) => c.owners[0] === b || c.owners[1] === b).length >= 12) return;
        const c = o
          ? M.Constraint.create({ bodyA: p, bodyB: q, stiffness: 0.2, damping: 0.6 })
          : M.Constraint.create({ bodyA: p, pointB: { x: p.position.x, y: p.position.y }, stiffness: 0.2, damping: 0.6 });
        c.owners = [b, o]; c.parts = o ? [p, q] : [p];
        c.parts.forEach((x) => { x.stuck = true; });
        lane.glued.push(c);
        M.Composite.add(lane.engine.world, c);
      });
    });
  }

  // une colle lâche si l'une des boules est avalée ou fond, ou si elle est trop étirée
  function unstick(lane) {
    lane.glued = lane.glued.filter((c) => {
      const pa = c.bodyA.position, pb = c.bodyB ? c.bodyB.position : c.pointB;
      const stretched = Math.hypot(pa.x - pb.x, pa.y - pb.y) - c.length;
      if (!c.owners.some((o) => o && o.state !== 'falling') && stretched < c.owners[0].R * 0.5) return true;
      M.Composite.remove(lane.engine.world, c);
      c.parts.forEach((x) => { x.stuck = false; });
      return false;
    });
  }

  // étirement / écrasement de dessin animé (affichage seulement, la physique n'est pas touchée) :
  // e > 0 étire en hauteur, e < 0 écrase en largeur, à aire constante. Glace dense : un seul écrasement, sans rebond.
  const STRETCH_MAX = 0.25, SQUASH_MAX = -0.22, SPRING = 260, BRAKE = 34, SETTLE = -0.07;   // FREIN ≈ amortissement critique : un seul « ploc », pas de rebond
  function squashStretch(lane, b, rawSpeed) {
    b.e = b.e || 0; b.ve = b.ve || 0;
    const previousSpeed = b.rawSpeed || 0;
    b.rawSpeed = rawSpeed;
    if (b.state !== 'falling') { b.e *= 0.9; b.ve = 0; return; }
    // en chute : s'étire avec la vitesse
    const target = lane.stack && lane.stack.has(b) ? SETTLE : Math.min(STRETCH_MAX, Math.max(0, (rawSpeed - 200) / 2400));   // posée : reste un peu tassée
    // impact : la vitesse s'effondre d'un coup, la boule s'écrase ; celles de dessous encaissent la moitié du choc
    if (previousSpeed > 250 && rawSpeed < previousSpeed * 0.5) {
      const impact = Math.min(previousSpeed, 1400) * 0.005;
      b.ve -= impact;
      if (lane.stack) lane.stack.forEach((o) => { if (o !== b && o.cy > b.cy) o.ve = (o.ve || 0) - impact * 0.15; });
    }
    // posée : elle s'étale en ~0,3 s sur la boule du dessous (ou dans la gueule)
    if (lane.stack && lane.stack.has(b)) b.spread = (b.spread || 0) + (1 - (b.spread || 0)) * Math.min(1, STEP * 9);
    b.ve += ((target - b.e) * SPRING - b.ve * BRAKE) * STEP;
    b.e = Math.min(STRETCH_MAX, Math.max(SQUASH_MAX, b.e + b.ve * STEP));
  }
  // la boule se dépose sur celle du dessous : tout point du dessous resté au-dessus de son dôme y descend
  // (un peu en dessous, pour recouvrir), si bien que le bord épouse les épaules de la boule inférieure sans vide
  function drape(C, S, b) {
    const R = b.R * b.s, spreadLevel = b.spread || 0, step = R * 0.06;
    return C.map((p) => {
      if (p.ny <= 0) return p;
      let top = Infinity;
      // seulement le dessus du dôme (normale vers le haut) : sur les flancs verticaux, pas de rideau
      S.forEach((q) => { if (q.ny < -0.25 && Math.abs(q.x - p.x) < step && q.y < top) top = q.y; });
      const target = top + R * 0.08;
      if (top === Infinity || p.y >= target) return p;
      return { x: p.x, y: p.y + (target - p.y) * Math.min(1, p.ny / 0.3) * spreadLevel, nx: p.nx, ny: p.ny };
    });
  }
  // déformation d'un point : écrasée, la boule s'aplatit sur ce qui la porte (ancrage en bas) ; étirée, autour du centre
  function deformer(b, R) {
    const e = b.e || 0, sy = 1 + e, sx = 1 / sy, ax = b.cx, ay = b.cy + (e < 0 ? R * 0.6 : 0);
    return (x, y) => [ax + (x - ax) * sx, ay + (y - ay) * sy];
  }

  // boule posée et immobile : elle devient un bloc statique (plus de rebond, plus de ressorts à calculer).
  // Ses colles restent, la suivante peut s'y poser.
  function freeze(lane, b) {
    b.frozen = true;
    partsOf(b).forEach((p) => M.Body.setStatic(p, true));
    M.Composite.remove(lane.engine.world, b.links);
  }

  function stepBodies(lane, g) {
    buildStatics(lane, g);
    // le cornet tient la tour : rappel vers l'axe de la gueule et amortissement latéral
    const axis = (g.head[1][0] + g.head[RIGHT_JAW][0]) / 2;
    // en chute : la boule descend droit sur l'axe, pour s'empiler en tour
    lane.scoops.forEach((b) => {
      if (b.state !== 'falling' || b.frozen || (lane.stack && lane.stack.has(b))) return;
      partsOf(b).forEach((p) => M.Body.setVelocity(p, { x: p.velocity.x * 0.85 - (b.cx - axis) * 0.02, y: p.velocity.y }));
    });
    // glace posée : jamais de remontée (pas de rebond), et le dessous s'affaisse dans les creux de ce qui la porte
    if (lane.stack) lane.stack.forEach((b) => {
      b.landed = true; b.settled = (b.settled || 0) + STEP;
      if (b.frozen) return;
      partsOf(b).forEach((p) => M.Body.setVelocity(p, { x: p.velocity.x * 0.8 - (b.cx - axis) * 0.01, y: Math.max(0, p.velocity.y) * 0.85 }));
      if (b.settled < 0.8) b.ring.forEach((p) => {
        if (!p.stuck && p.position.y > b.cy) M.Body.translate(p, { x: 0, y: b.R * b.s * 0.004 * (1 - b.settled / 0.8) });
      });
    });
    lane.scoops.forEach((b) => {
      b.age += STEP;
      let s = b.s;
      if (b.state === 'falling') s = Math.min(1, S0 + (b.age / EXIT_TIME) * (1 - S0));
      if (s !== b.s) {
        const k = Math.max(0.05, s) / Math.max(0.05, b.s);
        if (k !== 1) M.Body.scale(b.core, k, k);
        b.links.forEach((c) => { c.length = c.base * s; });
        b.s = s;
      }
    });
    M.Engine.update(lane.engine, STEP * 1000);
    lane.scoops.forEach((b) => {
      // sortie du tuyau : poussée à vitesse constante, elle ne tombe librement qu'une fois sortie
      if (b.age < EXIT_TIME) {
        const dy = b.y0 + (b.y1 - b.y0) * (b.age / EXIT_TIME) - b.ring.reduce((m, p) => m + p.position.y, 0) / RING_SIZE;
        partsOf(b).forEach((p) => { M.Body.translate(p, { x: 0, y: dy }); M.Body.setVelocity(p, { x: p.velocity.x, y: (b.y1 - b.y0) / EXIT_TIME / 60 }); });
      }
      let cx = 0, cy = 0;
      b.ring.forEach((p) => { cx += p.position.x; cy += p.position.y; });
      const rawSpeed = (cy / RING_SIZE - b.cy) / STEP;
      b.vy = b.vy * 0.8 + rawSpeed * 0.2;
      b.cx = cx / RING_SIZE; b.cy = cy / RING_SIZE;
      let sn = 0, cs = 0;
      b.ring.forEach((p, i) => {
        const [rx, ry] = b.rest[i], dx = p.position.x - b.cx, dy = p.position.y - b.cy;
        cs += rx * dx + ry * dy; sn += rx * dy - ry * dx;
      });
      b.ang = Math.atan2(sn, cs);
      squashStretch(lane, b, rawSpeed);
      if (b.frozen) return;
      if (b.state === 'falling' && b.age > EXIT_TIME) applyPlasticity(b);
      // glace dense : les particules suivent le mouvement d'ensemble au lieu d'osciller
      if (b.state === 'falling') {
        const P = partsOf(b);
        let vx = 0, vy = 0;
        P.forEach((p) => { vx += p.velocity.x; vy += p.velocity.y; });
        vx /= P.length; vy /= P.length;
        P.forEach((p) => M.Body.setVelocity(p, { x: p.velocity.x + (vx - p.velocity.x) * DAMPING, y: p.velocity.y + (vy - p.velocity.y) * DAMPING }));
      }
      keepVolume(b);
    });
    stick(lane, g);
    unstick(lane);
    // la pile du cornet : les boules collées à la gueule, puis celles collées sur elles…
    const stack = new Set(lane.glued.filter((c) => !c.owners[1]).map((c) => c.owners[0]));
    for (let added = true; added;) {
      added = false;
      lane.glued.forEach((c) => {
        const [a, o] = c.owners;
        if (o && stack.has(a) !== stack.has(o)) { stack.add(a); stack.add(o); added = true; }
      });
    }
    stack.forEach((b) => { if (b.state !== 'falling') stack.delete(b); });
    lane.stack = stack;
    // posée depuis un instant et immobile (ou posée depuis longtemps) : on la fige
    stack.forEach((b) => {
      if (!b.frozen && b.settled > 0.25 && (Math.abs(b.rawSpeed) < 30 || b.settled > 0.8)) freeze(lane, b);
    });
    // gouttes
    lane.drops.forEach((d) => {
      d.vy += G * STEP; d.x += d.vx * STEP; d.y += d.vy * STEP;
      if (d.y > g.H || d.x < -20 || d.x > g.W + 20 || isInside(d, g.head)) d.dead = true;
      lane.scoops.forEach((b) => { if (Math.hypot(d.x - b.cx, d.y - b.cy) < b.R * b.s * 0.85) d.dead = true; });
    });
    lane.drops = lane.drops.filter((d) => !d.dead);
  }

  // contour dessiné : spline passant par la peau, surface légèrement grumeleuse et petites coulures sur le bas
  function outline(b) {
    const n = RING_SIZE, R = b.R * b.s, K = 12, out = [];   // assez de points pour des coulures fines et arrondies
    const speed = b.state === 'falling' ? Math.min(1, Math.max(0, (b.vy - 120) / 700)) : 0;
    const angleGap = (a, c) => { const d = Math.abs(a - c) % (Math.PI * 2); return Math.min(d, Math.PI * 2 - d); };
    // peau lissée (moyenne avec les voisines), particule trop écartée ramenée (sinon une colle étirée fait une pointe),
    // puis repoussée du rayon des particules
    const Q = b.ring.map((p) => p.position);
    const mean = Q.reduce((m, p) => m + Math.hypot(p.x - b.cx, p.y - b.cy), 0) / n;
    const P = Q.map((p, i) => {
      const a = Q[(i + n - 1) % n], c = Q[(i + 1) % n];
      const x = p.x * 0.5 + (a.x + c.x) * 0.25, y = p.y * 0.5 + (a.y + c.y) * 0.25;
      const dx = x - b.cx, dy = y - b.cy, d = Math.hypot(dx, dy) || 1, r = Math.min(d, mean * 1.3) + b.rp * b.s * 1.25;
      return { x: b.cx + (dx / d) * r, y: b.cy + (dy / d) * r };
    });
    const cr = (a, p, q, r, t) => 0.5 * (2 * p + (q - a) * t + (2 * a - 5 * p + 4 * q - r) * t * t + (3 * p - a - 3 * q + r) * t * t * t);
    for (let i = 0; i < n; i++) {
      const p0 = P[(i + n - 1) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
      for (let k = 0; k < K; k++) {
        const t = k / K, x = cr(p0.x, p1.x, p2.x, p3.x, t), y = cr(p0.y, p1.y, p2.y, p3.y, t);
        const dx = x - b.cx, dy = y - b.cy, d = Math.hypot(dx, dy) || 1, nx = dx / d, ny = dy / d;
        const th = ((i + t) / n) * Math.PI * 2;
        // dôme lisse : à peine de relief en haut
        let bump = 0.006 * Math.sin(13 * th + b.ph[0]);
        b.bumps.forEach((o) => { bump += o.h * 0.5 * Math.exp(-((angleGap(th, o.th) / o.w) ** 2)); });
        // en chute, l'air étire le haut en flammèches
        if (speed && ny < 0) {
          const wa = Math.atan2(ny, nx);
          b.lobes.forEach((o) => { bump += speed * o.h * Math.exp(-((angleGap(wa, o.a) / o.w) ** 2)); });
        }
        // bas : bord ondulé d'où pendent des coulures arrondies, de longueurs variées (vers le bas, pas selon la normale)
        let drip = 0;
        const [z0, zl] = b.first ? [-0.05, 0.35] : [0.05, 0.3];
        if (ny > z0) {
          const zone = Math.min(1, (ny - z0) / zl);
          drip = zone * b.look.scallop * (0.5 + 0.5 * Math.cos(b.look.scallopCount * th + b.ph[2]));
          b.drips.forEach((o) => {
            const d = angleGap(th, o.th) / o.w;
            if (d < 1) drip += zone * o.l * Math.sqrt(1 - d * d);           // doigt au bout arrondi
            drip += zone * o.l * 0.25 * Math.exp(-((d / 2.2) ** 2));        // évasé à la base
          });
        }
        // dessin plus rond que le corps physique : le dôme monte plus haut que la zone de contact. Posée, la boule
        // s'enfonce dans ce dôme de la boule du dessous (sauf la première, dans la gueule) : elles s'emboîtent.
        const spreadLevel = b.spread || 0, low = Math.max(0, ny);
        // drapé : posée sur une autre boule, les flancs s'élargissent et retombent sur ses épaules,
        // plus bas que le milieu du dessous (qui reste niché sur le dôme) : la boule coiffe celle du dessous
        const flank = b.first ? 0 : Math.abs(nx) ** 1.5 * Math.min(1, Math.max(0, (ny + 0.35) / 0.5));
        // la première garde sa forme d'origine : étalée, plus large, flancs qui coulent dans la gueule
        const ex = b.first ? nx * R * spreadLevel * (0.1 + 0.2 * low) * b.look.widen : nx * R * spreadLevel * (0.04 + 0.1 * flank) * b.look.widen;
        const ey = b.first
          ? R * spreadLevel * (0.08 + (ny < 0 ? -ny * 0.12 : 0.3 * low * Math.abs(nx) * b.look.drip))
          : (ny < 0 ? ny * R * 0.24 : low * R * 0.06) + R * spreadLevel * (0.2 + 0.12 * flank) * b.look.drip;
        out.push({ x: x + nx * bump * R + ex, y: y + ny * bump * R + ey + drip * R * (0.35 + 0.65 * spreadLevel), nx, ny });
      }
    }
    return out;
  }

  // trame de points (demi-teinte) d'une couleur, un motif par couleur
  function halftone(ctx, coul, step = 4, r = 0.95) {
    const key = coul + step + r;
    if (!halftones[key]) {
      // trame en quinconce, dessinée en double résolution pour rester nette sur écran dense
      const t = document.createElement('canvas'); t.width = t.height = step * 2;
      const c = t.getContext('2d'); c.scale(2, 2); c.fillStyle = coul;
      [[step / 2, step / 2], [0, 0], [step, 0], [0, step], [step, step]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); });
      const motif = ctx.createPattern(t, 'repeat');
      motif.setTransform(new DOMMatrix().scale(0.5));
      halftones[key] = motif;
    }
    return halftones[key];
  }

  // ---------- Rendu des boules : le cel-shading de l'accueil, appliqué au contour physique ----------
  // Même lumière et mêmes seuils que le shader de l'accueil. Sur une sphère, la limite « n·L = k » est une ellipse
  // connue : on y projette le contour réel, donc l'ombre suit l'écrasement, le drapé et les coulures.
  const LIGHT = { x: -0.551, y: 0.702, z: 0.451 };       // x vers la droite, y vers le haut
  const LIGHT_XY = Math.hypot(LIGHT.x, LIGHT.y), AXIS = { x: LIGHT.x / LIGHT_XY, y: LIGHT.y / LIGHT_XY };
  const MID_THRESHOLD = 0.42, SHADOW_THRESHOLD = 0.08;

  function scoopFrame(C) {
    // le dôme seul : les coulures ne comptent pas dans le volume éclairé
    let g = Infinity, d = -Infinity, h = Infinity, b = -Infinity;
    C.forEach((p) => {
      if (p.ny > 0.5) return;
      if (p.x < g) g = p.x; if (p.x > d) d = p.x; if (p.y < h) h = p.y; if (p.y > b) b = p.y;
    });
    const rx = Math.max(1, (d - g) / 2), ry = Math.max(1, (b - h) / 1.5);
    return { cx: (g + d) / 2, cy: h + ry, rx, ry };
  }

  function traceZone(ctx, C, f, k) {
    const s = Math.sqrt(1 - k * k), t0 = k * LIGHT_XY;
    ctx.beginPath();
    C.forEach((p, i) => {
      const X = (p.x - f.cx) / f.rx, Y = -(p.y - f.cy) / f.ry;
      const u = X * AXIS.x + Y * AXIS.y, v = -X * AXIS.y + Y * AXIS.x;
      const u2 = u < 0 ? t0 + u * s * LIGHT.z : t0 + u * 3;
      const v2 = v * (s + (1.25 - s) * Math.min(1, Math.max(0, u)));
      const x = f.cx + (u2 * AXIS.x - v2 * AXIS.y) * f.rx, y = f.cy - (u2 * AXIS.y + v2 * AXIS.x) * f.ry;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.closePath();
  }

  function draw(lane, g) {
    const cv = lane.canvas, dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(g.W * dpr), h = Math.round(g.H * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const ctx = lane.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, g.W, g.H);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    lane.drops.forEach((d) => {
      const st = Math.min(1.8, 1 + Math.abs(d.vy) / 900);
      ctx.globalAlpha = 1; ctx.fillStyle = d.flavor[0];
      ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r / Math.sqrt(st), d.r * st, 0, 0, 7); ctx.fill();
      ctx.save(); ctx.clip(); ctx.fillStyle = halftone(ctx, d.flavor[1]);
      ctx.beginPath(); ctx.ellipse(d.x - d.r * 0.2, d.y - d.r * 0.3 * st, d.r * 0.5, d.r * st * 0.6, 0, 0, 7); ctx.fill(); ctx.restore();
    });
    // de bas en haut : le bourrelet de la boule du dessus recouvre celle du dessous
    const visible = lane.scoops.filter((b) => b.s > 0.02).sort((a, b) => b.cy - a.cy);
    // de bas en haut : chaque boule posée drape son dessous sur le contour déjà calculé de la boule qui la porte
    const outlines = new Map();
    visible.forEach((b) => {
      const def = deformer(b, b.R * b.s);
      let C = outline(b).map((p) => { const [x, y] = def(p.x, p.y); return { x, y, nx: p.nx, ny: p.ny }; });
      if (!b.first && lane.stack && lane.stack.has(b)) {
        const below = visible.reduce((m, o) => (outlines.has(o) && o.cy > b.cy && Math.abs(o.cx - b.cx) < o.R && (!m || o.cy < m.cy) ? o : m), null);
        if (below) C = drape(C, outlines.get(below), b);
      }
      outlines.set(b, C);
    });
    // collée à la gueule : la glace tassée remplit le creux du V sous la boule, sans vide entre elle et les mâchoires.
    // Tracé avant toutes les boules et limité à la largeur du dessous de la boule, pour ne jamais recouvrir une voisine.
    visible.forEach((b) => {
      if (lane.rise || b.state !== 'falling' || !lane.glued.some((c) => c.owners[0] === b && !c.owners[1])) return;
      const C = outlines.get(b), n = C.length, [base, , dark] = b.flavor;
      let iG = 0, iD = 0, iB = 0;
      C.forEach((p, i) => { if (p.x < C[iG].x) iG = i; if (p.x > C[iD].x) iD = i; if (p.y > C[iB].y) iB = i; });
      // l'arc gauche → droite qui passe par le point le plus bas
      const step = (iB - iG + n) % n < (iD - iG + n) % n ? 1 : -1;
      ctx.save();
      ctx.beginPath();
      g.head.slice(1, RIGHT_JAW + 1).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath(); ctx.clip();
      ctx.beginPath();
      for (let i = iG; ; i = (i + step + n) % n) { i === iG ? ctx.moveTo(C[i].x, C[i].y) : ctx.lineTo(C[i].x, C[i].y); if (i === iD) break; }
      ctx.lineTo(C[iD].x, g.H); ctx.lineTo(C[iG].x, g.H); ctx.closePath();
      ctx.globalAlpha = 1; ctx.fillStyle = base; ctx.fill();
      ctx.globalAlpha = 0.18; ctx.fillStyle = dark; ctx.fill();
      ctx.globalAlpha = 0.6; ctx.fillStyle = halftone(ctx, dark); ctx.fill();
      ctx.restore();
    });
    // pendant le repas, on ne dessine que ce qui est encore au-dessus des mâchoires
    if (lane.rise) {
      const points = jawLine(g, lane.rise);
      ctx.save();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(g.W, 0); ctx.lineTo(g.W, points[points.length - 1][1]);
      for (let i = points.length - 1; i >= 0; i--) ctx.lineTo(points[i][0], points[i][1]);
      ctx.lineTo(0, points[0][1]); ctx.closePath(); ctx.clip();
    }
    visible.forEach((b) => {
      const R = b.R * b.s, [base, light, shadow, mid, screen] = b.flavor;
      // traînées en chute : coulures étirées au-dessus de la boule, plus longues quand elle tombe vite
      const speed = b.state === 'falling' ? Math.min(1, Math.max(0, (b.vy - 120) / 700)) : 0;
      if (speed > 0) b.trails.forEach((t) => {
        const x = b.cx + t.u * R, y0 = b.cy - R * (0.55 + t.d), y1 = y0 - R * t.l * speed;
        ctx.globalAlpha = 1; ctx.lineWidth = R * t.w;
        ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x + t.u * R * 0.05, y1);
        ctx.strokeStyle = base; ctx.stroke();
        ctx.lineWidth = R * t.w * 0.45; ctx.strokeStyle = halftone(ctx, light); ctx.stroke();
      });
      const C = outlines.get(b);
      ctx.beginPath();
      C.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.globalAlpha = 1; ctx.fillStyle = shadow; ctx.fill();
      ctx.save(); ctx.clip();
      const f = scoopFrame(C);
      // ombre : trame dense
      ctx.fillStyle = halftone(ctx, screen, 5, 1.45); ctx.fillRect(0, 0, g.W, g.H);
      // demi-teinte : trame légère
      traceZone(ctx, C, f, SHADOW_THRESHOLD);
      ctx.fillStyle = mid; ctx.fill();
      ctx.globalAlpha = 0.55; ctx.fillStyle = halftone(ctx, screen, 6, 0.9); ctx.fill(); ctx.globalAlpha = 1;
      // lumière : aplat
      traceZone(ctx, C, f, MID_THRESHOLD);
      ctx.fillStyle = base; ctx.fill();
      // reflet brillant, à l'endroit où le shader de l'accueil le place
      ctx.beginPath();
      ctx.ellipse(f.cx - 0.324 * f.rx, f.cy - 0.413 * f.ry, 0.15 * f.rx, 0.12 * f.ry, Math.atan2(0.413 * f.ry, 0.324 * f.rx) + Math.PI / 2, 0, 7);
      ctx.globalAlpha = 0.85; ctx.fillStyle = '#fff'; ctx.fill(); ctx.globalAlpha = 1;
      ctx.restore();
      // contour encré, comme à l'accueil
      ctx.beginPath();
      C.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.globalAlpha = 1; ctx.lineWidth = Math.max(1.5, R * 0.045); ctx.strokeStyle = '#000'; ctx.stroke();
    });
    if (lane.rise) ctx.restore();
    ctx.globalAlpha = 1;
  }

  // ---------- Le repas : à l'arrivée, le poisson allonge le cou et mange sa tour, puis le tuyau ----------
  const MEAL_RISE = 1.7, MEAL_PAUSE = 0.2, MEAL_RETURN = 0.55, MEAL_WAIT = 0.35, MEAL_MAX = 6;
  const MEAL_INSTANT = window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches;

  // le bord des mâchoires, là où la tête est montée : tout ce qui passe sous cette ligne est mangé
  const jawLine = (g, rise) => g.head.slice(1, RIGHT_JAW + 1).map(([x, y]) => [x, y - rise]);
  const finalRise = (g) => Math.max(0, g.head[RIGHT_JAW][1] - 26 * g.k);

  function advanceMeal(lane, g, dt) {
    if (lane.mealDone || !lane.finished) return;
    if (!lane.meal) {
      // on attend que la dernière boule soit posée (avec une limite, pour ne jamais rester bloqué)
      lane.sinceFinish = (lane.sinceFinish || 0) + dt;
      const ready = !lane.queued && !lane.pushing && lane.scoops.length >= lane.launched && lane.scoops.every((b) => b.frozen);
      lane.ready = ready ? (lane.ready || 0) + dt : 0;
      if (lane.ready < MEAL_WAIT && lane.sinceFinish < MEAL_MAX) return;
      lane.meal = { t: MEAL_INSTANT ? MEAL_RISE + MEAL_PAUSE + MEAL_RETURN : 0 };
    }
    const t = (lane.meal.t += dt), top = g.head[MOUTH_BOTTOM][1], end = finalRise(g);
    let rise = top;
    if (t < MEAL_RISE) { const u = t / MEAL_RISE; rise = top * (u < 0.5 ? 2 * u * u : 1 - (2 - 2 * u) ** 2 / 2); }
    else if (t >= MEAL_RISE + MEAL_PAUSE) {
      // retour avec un léger dépassement
      const u = Math.min(1, (t - MEAL_RISE - MEAL_PAUSE) / MEAL_RETURN) - 1;
      rise = top + (end - top) * (1 + 2.7 * u * u * u + 1.7 * u * u);
    }
    lane.rise = rise;
    lane.el.style.setProperty('--neck-rise', rise.toFixed(1) + 'px');
    // le tuyau se déforme entre les mâchoires et disparaît de bas en haut
    const bottom = top - rise;
    if (t < MEAL_RISE && bottom < g.top) {
      const points = jawLine(g, rise).map(([x, y]) => [x - g.fx, y]);
      const outline = [[0, 0], [g.fw, 0], [g.fw, points[points.length - 1][1]]].concat(points.slice().reverse(), [[0, points[0][1]]]);
      lane.pipe.style.clipPath = 'polygon(' + outline.map(([x, y]) => x.toFixed(1) + 'px ' + y.toFixed(1) + 'px').join(',') + ')';
      const p = 1 - bottom / g.top;
      lane.pipe.style.setProperty('--frame', p < 0.25 ? 1 : p < 0.55 ? 2 : 3);
    }
    if (t >= MEAL_RISE && !lane.meal.swallowed) {
      lane.meal.swallowed = true;
      lane.pipe.style.visibility = 'hidden';
      lane.scoops.forEach((b) => M.Composite.remove(lane.engine.world, partsOf(b).concat(b.links)));
      lane.glued.forEach((c) => M.Composite.remove(lane.engine.world, c));
      lane.scoops = []; lane.glued = []; lane.drops = []; lane.stack = null;
    }
    if (t >= MEAL_RISE + MEAL_PAUSE + MEAL_RETURN) {
      lane.meal = null; lane.mealDone = true; lane.rise = 0;
    }
  }

  function scoopLoop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    leftover += dt; lastTime = now;
    let active = false;
    lanes.forEach((lane) => {
      if (!lane.canvas) return;
      const g = geometry(lane);
      if (!g) return;
      let n = 0;
      advanceMeal(lane, g, dt);
      if (lane.engine && !lane.meal) while (leftover - n * STEP >= STEP && n < 6) { stepBodies(lane, g); n++; }
      draw(lane, g);
      if (lane.scoops.length || lane.drops.length || lane.meal) active = true;
    });
    leftover -= Math.floor(leftover / STEP) * STEP;
    if (leftover > STEP) leftover = 0;
    rafId = active ? requestAnimationFrame(scoopLoop) : null;
  }

  function keepNeckOnResize() {
    lanes.forEach((lane) => {
      const g = lane.mealDone && geometry(lane);
      if (g) lane.el.style.setProperty('--neck-rise', finalRise(g).toFixed(1) + 'px');
    });
  }
  window.addEventListener('resize', keepNeckOnResize);

  lanes = players.map((player, id) => {
    const el = document.createElement('div');
    el.className = 'race-lane' + (player.me ? ' is-me' : '');
    const pipe = document.createElement('span');
    pipe.className = 'race-pipe';
    pipe.setAttribute('aria-hidden', 'true');
    pipe.style.setProperty('--img', 'url(' + images.pipe + ')');
    const neck = document.createElement('span');
    neck.className = 'race-neck';
    neck.setAttribute('aria-hidden', 'true');
    const fish = document.createElement('img');
    fish.className = 'race-fish';
    fish.alt = '';
    fish.src = images.fish[0];
    const canvas = document.createElement('canvas');
    canvas.className = 'race-tank';
    canvas.setAttribute('aria-hidden', 'true');
    el.append(pipe, neck, fish, canvas);
    root.appendChild(el);
    return { id, el, fish, pipe, canvas, ctx: canvas.getContext('2d'), scoops: [], drops: [], launched: 0, step: 0, stamp: null, finished: false };
  });
  lanes.forEach(mouth);

  return {
    /** fraction : part du texte faite par ce joueur, de 0 à 1. */
    setProgress: serve,
    /** Le joueur a terminé : pose son tampon de rang, puis le poisson mange sa tour. */
    finish(id, label) {
      const lane = lanes[id];
      if (!lane || lane.finished) return;
      lane.finished = true;
      lane.stamp = document.createElement('span');
      lane.stamp.className = 'race-rank';
      lane.stamp.lang = 'ja';
      lane.stamp.textContent = label;
      lane.el.appendChild(lane.stamp);
      if (!rafId) { lastTime = performance.now(); rafId = requestAnimationFrame(scoopLoop); }
    },
    destroy() {
      window.removeEventListener('resize', keepNeckOnResize);
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      const closing = lanes;
      lanes = [];                // les minuteurs encore en route vérifient que leur couloir existe toujours
      closing.forEach((lane) => {
        clearTimeout(lane.timer);
        if (lane.engine) M.Engine.clear(lane.engine);
        lane.el.remove();
      });
    },
  };
}
