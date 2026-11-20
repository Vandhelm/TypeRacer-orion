// PERF-03 : la piste reste fluide avec la capacité maximale de participants (SALLE-05 : 30). Un compte hôte, 22 invités
// et les 7 bots du salon, bonus de remontée activés (CONF-09). L'hôte tape dans sa page, mesurée ; les invités courent
// par le serveur temps réel (un ticket et une socket chacun, depuis Node, sans page à afficher), comme une vraie page.
// Lancement : `bun run test:perf` (voir docs/TESTS.md). Hors de `bun test` et de `bun run test:e2e`.
import { writeFileSync, mkdirSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { defaultBots } from "../../src/rooms/bots";
import { MAX_GUESTS } from "../../src/rooms/settings";
import { E2E_BASE_URL } from "./env";
import { frameStats, type FrameStats, type Task } from "./frames";
import { createRoom, signUp } from "./helpers";

/** Seuils (docs/TESTS.md) : 55 images par seconde en moyenne, moins de 5 % d'images sautées, aucune longue tâche de plus de 100 ms. */
const MIN_FPS = Number(process.env.PERF_MIN_FPS ?? 55);
const MAX_DROPPED = Number(process.env.PERF_MAX_DROPPED ?? 0.05);
const MAX_LONG_TASK_MS = Number(process.env.PERF_MAX_LONG_TASK_MS ?? 100);
/** Ralentissement du processeur (Chrome DevTools) : 1 = la machine telle quelle, 4 = un portable modeste. */
const CPU_THROTTLE = Number(process.env.PERF_CPU_THROTTLE ?? 4);
/** Fenêtre mesurée, en pleine course (après le départ et l'arrivée des premières boules). */
const MEASURE_MS = Number(process.env.PERF_MEASURE_MS ?? 15_000);
const REPORT_DIR = "reports/perf";
/** Catégories de la trace Chrome (onglet Performance de DevTools). PERF_TRACE=invalidation ajoute qui invalide les styles (plus lent). */
const TRACE_CATEGORIES = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "disabled-by-default-v8.cpu_profiler",
  "v8.execute",
  "blink.user_timing",
  ...(process.env.PERF_TRACE === "invalidation" ? ["disabled-by-default-devtools.timeline.invalidationTracking", "disabled-by-default-devtools.timeline.stack"] : []),
];

const BOTS = defaultBots(7, "mixed");
const GUESTS = MAX_GUESTS - 1 - BOTS.length;

type Recorder = { stamps: number[]; tasks: Task[]; frames: { start: number; duration: number; blocking: number; scripts: { source: string; duration: number }[] }[]; stop: boolean };
declare global {
  interface Window {
    __perf?: Recorder;
  }
}

/** Un invité qui court sans page : cookie invité, place dans le salon, ticket, puis une socket qui envoie sa progression. */
async function guestRunner(request: APIRequestContext, index: number, code: string) {
  const nickname = `Perf_${String(index).padStart(2, "0")}_${Math.random().toString(36).slice(2, 6)}`;
  expect((await request.post("/api/guest", { data: { nickname } })).status()).toBe(200);
  const joined = await request.post("/api/rooms/join", { data: { code } });
  expect(joined.status(), await joined.text()).toBe(200);
  const grant = (await (await request.post("/api/realtime/ticket")).json()) as { ticket: string; url: string };
  // WebSocket de Node (undici) : l'en-tête Origin est exigé par le serveur temps réel
  const Socket = WebSocket as unknown as new (url: string, init: { headers: Record<string, string> }) => WebSocket;
  const socket = new Socket(`${grant.url}/?ticket=${encodeURIComponent(grant.ticket)}`, { headers: { origin: E2E_BASE_URL } });
  let startsAt: number | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  // de 35 à 90 MPM environ : une course entière, avec des retardataires pour les bonus
  const perSecond = 1 / (40 + (index % 8) * 10);
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as { type: string; startsAt?: number };
    if (message.type === "standings" && message.startsAt && startsAt === null) {
      startsAt = message.startsAt;
      timer = setInterval(() => {
        const elapsed = (Date.now() - startsAt!) / 1000;
        if (elapsed <= 0) return;
        const progress = Math.min(1, elapsed * perSecond);
        socket.send(JSON.stringify({ type: "progress", progress, wpm: Math.round(perSecond * 60 * 60) }));
        if (progress >= 1) clearInterval(timer);
      }, 700);
    }
  });
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ type: "join", room: code }));
      resolve();
    });
    socket.addEventListener("error", () => reject(new Error(`guest ${index}: socket error`)));
  });
  return () => {
    clearInterval(timer);
    socket.close();
  };
}

/** Le recorder posé dans la page : chaque image (requestAnimationFrame), les longues tâches et les longues images. */
function record() {
  const perf: Recorder = { stamps: [], tasks: [], frames: [], stop: false };
  window.__perf = perf;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) perf.tasks.push({ start: entry.startTime, duration: entry.duration });
  }).observe({ type: "longtask" });
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { blockingDuration: number; scripts: { sourceFunctionName: string; sourceURL: string; invoker: string; duration: number }[] })[])
        perf.frames.push({
          start: entry.startTime,
          duration: entry.duration,
          blocking: entry.blockingDuration,
          scripts: entry.scripts.map((s) => ({ source: `${s.invoker} ${s.sourceFunctionName} ${s.sourceURL.split("/").pop()}`, duration: s.duration })),
        });
    }).observe({ type: "long-animation-frame" });
  } catch {
    // Long Animation Frames : Chromium seulement
  }
  const loop = (now: number) => {
    perf.stamps.push(now);
    if (!perf.stop) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

async function measure(page: Page): Promise<{ stats: FrameStats; recorder: Recorder; metrics: Record<string, number> }> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const metricsOf = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  const before = await metricsOf();
  await page.evaluate(record);
  await page.waitForTimeout(MEASURE_MS);
  const recorder = await page.evaluate(() => {
    window.__perf!.stop = true;
    return window.__perf!;
  });
  const after = await metricsOf();
  const delta = (name: string) => Math.round(((after[name] ?? 0) - (before[name] ?? 0)) * 1000) / 1000;
  const metrics = {
    layouts: delta("LayoutCount"),
    styleRecalcs: delta("RecalcStyleCount"),
    layoutSeconds: delta("LayoutDuration"),
    styleSeconds: delta("RecalcStyleDuration"),
    scriptSeconds: delta("ScriptDuration"),
    taskSeconds: delta("TaskDuration"),
    heapMB: Math.round((after.JSHeapUsedSize ?? 0) / 1e5) / 10,
    nodes: after.Nodes ?? 0,
  };
  return { stats: frameStats(recorder.stamps, recorder.tasks), recorder, metrics };
}

test.describe("PERF-03 — the race track stays smooth at full capacity", () => {
  test.setTimeout(300_000);

  test(`${MAX_GUESTS} runners (1 host, ${GUESTS} guests, ${BOTS.length} bots) with catch-up bonuses`, async ({ page, playwright, browser }) => {
    await signUp(page);
    const code = await createRoom(page);
    const patched = await page.request.patch(`/api/rooms/${code}`, {
      data: { settings: { visibility: "public", guests: MAX_GUESTS, bots: true, botList: BOTS, catchUpBonus: true, duration: 90, textType: "words", length: "medium" } },
    });
    expect(patched.status(), await patched.text()).toBe(200);

    // chaque invité a son IP (TRUST_PROXY=1 sur le serveur de test) : la limite d'entrées par IP (SALLE-10) ne joue pas
    const contexts = await Promise.all(
      Array.from({ length: GUESTS }, (_, i) => playwright.request.newContext({ baseURL: E2E_BASE_URL, extraHTTPHeaders: { "x-forwarded-for": `10.3.0.${i + 10}` } })),
    );
    const stops = await Promise.all(contexts.map((request, i) => guestRunner(request, i, code)));

    try {
      const players = page.getByRole("region", { name: "Players" });
      await expect(players.getByRole("listitem")).toHaveCount(MAX_GUESTS, { timeout: 30_000 });
      await page.getByRole("button", { name: "START THE GAME" }).click();
      await page.waitForURL(/\/game\?code=/);
      await expect(page.getByRole("list", { name: /^Track/ }).getByRole("listitem")).toHaveCount(MAX_GUESTS);

      const typing = page.getByRole("region", { name: "Typing area" });
      const field = typing.getByRole("textbox", { name: "Type here" });
      await expect(field).toBeEditable({ timeout: 20_000 });
      const text = (await typing.locator("p[lang] > span").allTextContents()).join(" ");
      await field.click();

      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });
      // l'hôte tape à ~100 MPM pendant toute la mesure : il mène, les points de contrôle des bonus tombent
      const typed = page.keyboard.type(text, { delay: 120 }).catch(() => {});
      await page.waitForTimeout(3_000);
      mkdirSync(REPORT_DIR, { recursive: true });
      await browser.startTracing(page, { path: `${REPORT_DIR}/race-pool-trace.json`, screenshots: false, categories: TRACE_CATEGORIES });
      const { stats, recorder, metrics } = await measure(page);
      await browser.stopTracing();
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      const bonuses = await page.locator('[data-part="bonus"]').count();
      // les animations CSS en cours à la fin de la mesure : chacune peut restyler sa cible à chaque image
      const animations = await page.evaluate(() => {
        const seen = new Map<string, number>();
        for (const animation of document.getAnimations()) {
          const target = (animation.effect as KeyframeEffect | null)?.target;
          const name = (animation as CSSAnimation).animationName ?? (animation as CSSTransition).transitionProperty ?? "script";
          const key = `${name} on ${target?.tagName.toLowerCase()}.${String(target?.className).split(" ")[0]}`;
          seen.set(key, (seen.get(key) ?? 0) + 1);
        }
        return Object.fromEntries(seen);
      });
      const worstFrames = [...recorder.frames].sort((a, b) => b.duration - a.duration).slice(0, 5);
      const report = { lanes: MAX_GUESTS, cpuThrottle: CPU_THROTTLE, bonusBadges: bonuses, stats, metrics, animations, worstFrames };
      writeFileSync(`${REPORT_DIR}/race-pool.json`, JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ lanes: MAX_GUESTS, cpuThrottle: CPU_THROTTLE, bonusBadges: bonuses, ...stats, ...metrics }));
      await typed;

      expect(stats.frames, "no frame recorded").toBeGreaterThan(0);
      expect(stats.fps, `average FPS over ${MEASURE_MS} ms`).toBeGreaterThanOrEqual(MIN_FPS);
      expect(stats.droppedShare, "share of frames over 25 ms").toBeLessThanOrEqual(MAX_DROPPED);
      expect(stats.worstLongTaskMs, "worst long task (ms)").toBeLessThanOrEqual(MAX_LONG_TASK_MS);
    } finally {
      stops.forEach((stop) => stop());
      await Promise.all(contexts.map((request) => request.dispose()));
    }
  });
});
