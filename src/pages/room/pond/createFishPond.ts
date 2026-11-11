/*
Fish Animation based on the great Youtube Video by argonaut:
https://www.youtube.com/watch?v=qlfh_rv6khY

Also based on the corresponding source code:
https://github.com/argonautcode/animal-proc-anim

Code written by Claude and ChatGPT, with minimal manual adjustments.
*/
export type PondFish = { name: string; color: string; me?: boolean };
export type FishPondApi = { sync(players: PondFish[]): void; destroy(): void };
type PondOptions = { reducedMotion: boolean; /** Un clic sur ces éléments ne jette pas de miette. */ noFoodSelector: string };

class Vector2 {
  constructor(public x: number, public y: number) {}
  add(v: Vector2) { return new Vector2(this.x + v.x, this.y + v.y); }
  sub(v: Vector2) { return new Vector2(this.x - v.x, this.y - v.y); }
  mult(n: number) { return new Vector2(this.x * n, this.y * n); }
  mag() { return Math.sqrt(this.x * this.x + this.y * this.y); }
  normalize() { const m = this.mag(); return m !== 0 ? this.mult(1 / m) : new Vector2(0, 0); }
  setMag(n: number) { return this.normalize().mult(n); }
  heading() { return Math.atan2(this.y, this.x); }
  static sub(a: Vector2, b: Vector2) { return new Vector2(a.x - b.x, a.y - b.y); }
  static fromAngle(angle: number) { return new Vector2(Math.cos(angle), Math.sin(angle)); }
}

function relativeAngleDiff(angle: number, anchor: number) {
  return ((((angle - anchor + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
}
function constrainAngle(angle: number, anchor: number, constraint: number) {
  const diff = relativeAngleDiff(angle, anchor);
  return anchor + Math.max(-constraint, Math.min(constraint, diff));
}

class Chain {
  joints: Vector2[];
  angles: number[] = [0];
  constructor(origin: Vector2, jointCount: number, private linkSize: number, private angleConstraint = Math.PI / 8) {
    this.joints = [origin];
    for (let i = 1; i < jointCount; i++) {
      this.joints.push(new Vector2(this.joints[i - 1]!.x, this.joints[i - 1]!.y + this.linkSize));
      this.angles.push(0);
    }
  }
  resolve(target: Vector2) {
    let pos = target;
    let dir = Vector2.sub(pos, this.joints[0]!);
    const distance = dir.mag();
    dir = dir.normalize();
    const maxMove = this.linkSize * 0.08;
    if (distance > maxMove) pos = this.joints[0]!.add(dir.mult(maxMove));
    this.joints[0] = pos;
    this.angles[0] = dir.heading();
    for (let i = 1; i < this.joints.length; i++) {
      const prev = this.joints[i - 1]!;
      const cur = Vector2.sub(prev, this.joints[i]!);
      this.angles[i] = constrainAngle(cur.heading(), this.angles[i - 1]!, this.angleConstraint);
      this.joints[i] = Vector2.sub(prev, Vector2.fromAngle(this.angles[i]!).mult(this.linkSize));
    }
  }
}

class Food {
  pos: Vector2;
  initialPos: Vector2;
  radius = 3;
  angleX = Math.random() * Math.PI * 2;
  angleY = Math.random() * Math.PI * 2;
  speed = 0.5 * Math.random();
  constructor(x: number, y: number) {
    this.pos = new Vector2(x, y);
    this.initialPos = new Vector2(x, y);
  }
  update() {
    this.angleX += 0.05 * this.speed;
    this.angleY += 0.05 * this.speed;
    this.pos.x = this.initialPos.x + Math.sin(this.angleX) * 5;
    this.pos.y = this.initialPos.y + Math.cos(this.angleY) * 5;
  }
  display(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

class Fish {
  spine: Chain;
  finColor: string;
  bodyWidth: number[];
  speed = 4;
  finWidth: number;
  finHeight: number;
  finSmallWidth: number;
  finSmallHeight: number;
  eyeRadius: number;
  maxTailWidth: number;
  targetFood: Food | null = null;
  wander: Vector2 | null = null;

  constructor(x: number, y: number, public size: number, public bodyColor: string) {
    this.spine = new Chain(new Vector2(x, y), 12, 32 * size, Math.PI / 8);
    const hsl = bodyColor.match(/\d+/g)!.map(Number);
    this.finColor = `hsl(${hsl[0]}, ${hsl[1]}%, ${Math.min(hsl[2]! + 20, 90)}%)`;
    this.bodyWidth = [34, 40.5, 42, 41.5, 38.5, 32, 25.5, 19, 16, 9.5].map((w) => w * size);
    this.finWidth = size * 80;
    this.finHeight = size * 32;
    this.finSmallWidth = size * 48;
    this.finSmallHeight = size * 16;
    this.eyeRadius = size * 8;
    this.maxTailWidth = size * 6.5;
  }
  update(target: Vector2) {
    const head = this.spine.joints[0]!;
    this.spine.resolve(head.add(Vector2.sub(target, head).setMag(this.speed)));
  }
  getPos(i: number, angleOffset: number, lengthOffset = 0) {
    const joint = this.spine.joints[i]!, angle = this.spine.angles[i]!, width = this.bodyWidth[i] || 0;
    return new Vector2(joint.x + Math.cos(angle + angleOffset) * (width / 2 + lengthOffset), joint.y + Math.sin(angle + angleOffset) * (width / 2 + lengthOffset));
  }
  drawEllipse(ctx: CanvasRenderingContext2D, pos: Vector2, angle: number, width: number, height: number) {
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(0, 0, width / 2, height / 2, 0, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  display(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = Math.max(1, 2 * this.size * 1.6);
    const j = this.spine.joints, a = this.spine.angles;
    const at = (i: number) => j[i]!, angle = (i: number) => a[i]!;
    const headToMid = relativeAngleDiff(angle(0), angle(6));
    const headToTail = headToMid + relativeAngleDiff(angle(6), angle(11));

    // nageoires pectorales et ventrales, sous le corps
    ctx.fillStyle = this.finColor;
    this.drawEllipse(ctx, this.getPos(3, Math.PI / 3), angle(2) - Math.PI / 4, this.finWidth, this.finHeight);
    this.drawEllipse(ctx, this.getPos(3, -Math.PI / 3), angle(2) + Math.PI / 4, this.finWidth, this.finHeight);
    this.drawEllipse(ctx, this.getPos(7, Math.PI / 2), angle(6) - Math.PI / 4, this.finSmallWidth, this.finSmallHeight);
    this.drawEllipse(ctx, this.getPos(7, -Math.PI / 2), angle(6) + Math.PI / 4, this.finSmallWidth, this.finSmallHeight);

    // queue
    ctx.beginPath();
    for (let i = 8; i < 12; i++) {
      const w = 0.75 * headToTail * (i - 8) * (i - 8) * this.size * 2;
      ctx.lineTo(at(i).x + Math.cos(angle(i) - Math.PI / 2) * w, at(i).y + Math.sin(angle(i) - Math.PI / 2) * w);
    }
    for (let i = 11; i >= 8; i--) {
      const w = Math.max(-this.maxTailWidth, Math.min(this.maxTailWidth, headToTail * 3));
      ctx.lineTo(at(i).x + Math.cos(angle(i) + Math.PI / 2) * w, at(i).y + Math.sin(angle(i) + Math.PI / 2) * w);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // corps
    ctx.fillStyle = this.bodyColor;
    ctx.beginPath();
    const noseOffset = this.bodyWidth[0]! / 2;
    const nose = new Vector2(at(0).x + Math.cos(angle(0)) * noseOffset, at(0).y + Math.sin(angle(0)) * noseOffset);
    const topControl = this.getPos(0, Math.PI / 4, this.bodyWidth[0]! / 8);
    const bottomControl = this.getPos(0, -Math.PI / 4, this.bodyWidth[0]! / 8);
    const topHead = this.getPos(0, Math.PI / 2);
    ctx.moveTo(topHead.x, topHead.y);
    ctx.quadraticCurveTo(topControl.x, topControl.y, nose.x, nose.y);
    const bottomHead = this.getPos(0, -Math.PI / 2);
    ctx.quadraticCurveTo(bottomControl.x, bottomControl.y, bottomHead.x, bottomHead.y);
    for (let i = 1; i < 10; i++) { const p = this.getPos(i, -Math.PI / 2); ctx.lineTo(p.x, p.y); }
    for (let i = 9; i > 0; i--) { const p = this.getPos(i, Math.PI / 2); ctx.lineTo(p.x, p.y); }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // nageoire dorsale
    ctx.fillStyle = this.finColor;
    ctx.beginPath();
    ctx.moveTo(at(3).x, at(3).y);
    ctx.quadraticCurveTo(
      at(5).x + Math.cos(angle(5) - Math.PI / 2) * headToMid * 8 * this.size * 2,
      at(5).y + Math.sin(angle(5) - Math.PI / 2) * headToMid * 8 * this.size * 2,
      at(6).x, at(6).y,
    );
    ctx.lineTo(at(3).x, at(3).y);
    ctx.fill();
    ctx.stroke();

    // yeux
    ctx.fillStyle = "#FFFFFF";
    this.drawEllipse(ctx, this.getPos(0, Math.PI / 2, -this.eyeRadius), 0, this.eyeRadius, this.eyeRadius);
    this.drawEllipse(ctx, this.getPos(0, -Math.PI / 2, -this.eyeRadius), 0, this.eyeRadius, this.eyeRadius);
  }
}

type SchoolEntry = { fish: Fish; color: string; me: boolean; leftAt?: number };

const MARGIN = 36;
const STEP_MS = 1000 / 60;
const FADE_MS = 400;

/** Le banc : chaque joueur présent est un poisson, partout sur l'écran, derrière le contenu. */
export function createFishPond(canvas: HTMLCanvasElement, { reducedMotion, noFoodSelector }: PondOptions): FishPondApi {
  const ctx = canvas.getContext("2d")!;
  const school = new Map<string, SchoolEntry>();
  let food: Food[] = [];
  let width = 600, height = 300, scale = 0.5;
  let last = 0, reserve = 0, frame = 0;

  const makeFish = (x: number, y: number, color: string) => new Fish(x, y, scale, color);
  const swimming = () => [...school.values()].filter((f) => !f.leftAt).map((f) => f.fish);

  // Chaque poisson vise une miette, sans se la disputer avec les autres
  function assignFood() {
    const fishes = swimming();
    let available = [...food];
    fishes.forEach((fish) => {
      if (fish.targetFood && food.includes(fish.targetFood)) available = available.filter((f) => f !== fish.targetFood);
      else fish.targetFood = null;
    });
    fishes.forEach((fish) => {
      if (fish.targetFood || !available.length) return;
      let min = Infinity, target: Food | null = null;
      available.forEach((f) => {
        const d = Vector2.sub(f.pos, fish.spine.joints[0]!).mag();
        if (d < min) { min = d; target = f; }
      });
      fish.targetFood = target;
      available = available.filter((f) => f !== target);
    });
    fishes.forEach((fish) => {
      if (!fish.targetFood) return;
      const head = fish.spine.joints[0]!;
      const current = Vector2.sub(fish.targetFood.pos, head).mag();
      for (const f of available) {
        if (Vector2.sub(f.pos, head).mag() < current) {
          available = available.filter((o) => o !== f).concat(fish.targetFood);
          fish.targetFood = f;
          break;
        }
      }
    });
  }

  function step() {
    food.forEach((f) => f.update());
    assignFood();
    swimming().forEach((fish) => {
      const target = fish.targetFood;
      const head = fish.spine.joints[0]!;
      if (!target) {
        // sans miette à viser, le poisson se promène n'importe où sur l'écran
        if (!fish.wander || Vector2.sub(fish.wander, head).mag() < 30) {
          const a = Math.min(MARGIN, width / 4), b = Math.min(MARGIN, height / 4);
          fish.wander = new Vector2(a + Math.random() * (width - 2 * a), b + Math.random() * (height - 2 * b));
        }
        fish.update(fish.wander);
        return;
      }
      if (Vector2.sub(target.pos, head).mag() < Math.max(5, 10 * fish.size)) {
        food = food.filter((f) => f !== target);
        fish.targetFood = null;
      } else fish.update(target.pos);
    });
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    food.forEach((f) => f.display(ctx));
    const now = performance.now();
    [...school.values()].sort((a, b) => Number(a.me) - Number(b.me)).forEach((f) => {
      ctx.globalAlpha = f.leftAt ? Math.max(0, 1 - (now - f.leftAt) / FADE_MS) : 1;
      f.fish.display(ctx);
    });
    ctx.globalAlpha = 1;
    school.forEach((f, name) => { if (f.leftAt && now - f.leftAt > FADE_MS) school.delete(name); });
  }

  // sans animation : les poissons sont simplement posés, répartis sur l'écran
  function layOut() {
    const list = [...school.values()], cols = Math.ceil(Math.sqrt(list.length)) || 1, rows = Math.ceil(list.length / cols) || 1;
    list.forEach((f, i) => {
      const x = (width / cols) * ((i % cols) + 0.5), y = (height / rows) * (Math.floor(i / cols) + 0.5) - 140 * scale;
      f.fish = makeFish(x, y, f.color);
      f.fish.spine.resolve(new Vector2(x, y - 1));
    });
    food = [];
    draw();
  }

  function measure() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const next = Math.max(0.24, Math.min(0.5, width / 1400));
    if (Math.abs(next - scale) > 0.01) {
      scale = next;
      // la taille a changé : on refait chaque poisson là où il se trouve
      school.forEach((f) => { const head = f.fish.spine.joints[0]!; f.fish = makeFish(head.x, head.y, f.color); });
    }
    // les miettes sorties de l'écran disparaissent
    food = food.filter((f) => f.initialPos.x < width && f.initialPos.y < height);
    if (reducedMotion) layOut();
  }

  // Le rythme d'origine est de 60 pas par seconde, quel que soit l'écran
  function swim(ms: number) {
    reserve = Math.min(reserve + (last ? ms - last : 0), 50);
    last = ms;
    while (reserve >= STEP_MS) { step(); reserve -= STEP_MS; }
    draw();
    frame = requestAnimationFrame(swim);
  }

  // Cliquer dans le vide jette une miette
  function onClick(e: MouseEvent) {
    if (reducedMotion || food.length > 60 || (e.target as Element).closest(noFoodSelector)) return;
    food.push(new Food(e.clientX, e.clientY));
  }
  function onResize() {
    measure();
    if (!reducedMotion) draw();
  }

  document.addEventListener("click", onClick);
  window.addEventListener("resize", onResize);
  measure();
  if (!reducedMotion) frame = requestAnimationFrame(swim);

  return {
    sync(players) {
      const names = new Set(players.map((p) => p.name));
      school.forEach((f, name) => { if (!names.has(name) && !f.leftAt) f.leftAt = performance.now(); });
      players.forEach((p) => {
        let entry = school.get(p.name);
        if (!entry || entry.leftAt) {
          // il arrive par le haut de l'écran
          const x = MARGIN + Math.random() * Math.max(1, width - 2 * MARGIN);
          entry = { color: p.color, fish: makeFish(x, -360 * scale, p.color), me: false };
          school.set(p.name, entry);
        }
        entry.me = !!p.me;
      });
      if (reducedMotion) layOut();
    },
    destroy() {
      cancelAnimationFrame(frame);
      document.removeEventListener("click", onClick);
      window.removeEventListener("resize", onResize);
    },
  };
}
