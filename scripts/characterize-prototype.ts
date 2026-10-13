/**
 * Phase 0 characterization: runs the frozen prototype (prototype/index.html) in headless
 * Chromium and records what it actually does, so the modular port can be compared with
 * measurements instead of memory. Writes tests/scenarios/baseline.json.
 *
 *   npm run characterize                 # 2 repeats of every scenario
 *   npm run characterize -- --repeats 1  # quicker
 *   npm run characterize -- --only quake-bare,wall-at-rest
 *
 * Needs network access: the prototype loads three.js and Rapier from jsDelivr and its
 * assets from api.polyhaven.com. The prototype file on disk is never changed. The served
 * copy gets extra read-only accessors on window.__lab (see PATCH below).
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from '@playwright/test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PROTOTYPE = join(ROOT, 'prototype/index.html');
const OUT = join(ROOT, 'tests/scenarios/baseline.json');

const argv = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const REPEATS = Number(arg('repeats') ?? 2);
const ONLY = arg('only')?.split(',');

// Read-only accessors added to the served copy. Nothing in the simulation changes.
const LAB_MARKER = 'window.__lab = { ';
const PATCH =
  LAB_MARKER +
  'bodies: () => bodies.map(o => { const t = o.body.translation(); const q = o.body.rotation(); return { kind: o.kind, x: t.x, y: t.y, z: t.z, sleeping: o.body.isSleeping(), tiltDeg: Math.acos(Math.min(1, 1 - 2 * (q.x * q.x + q.z * q.z))) * 180 / Math.PI }; }), ' +
  'natBeat: () => natBeat, roof: () => roofSwing(), frameCount: () => frames.length, renderer, ';

type Mode = 'steady' | 'sweep' | 'quake';
type BuildingType = 'bare' | 'braced' | 'isolated';
interface Scenario {
  id: string;
  source: string;
  handoffClaim: string | null;
  config: { type: BuildingType; mode: Mode; f?: number; g: number };
  shakeSeconds?: number; // steady mode never ends by itself, so it is stopped after this long
  expect: (run: RunResult) => boolean | null; // null when there is no claim to check
}
interface StoryResult {
  label: string;
  maxDriftPct: number;
  maxDamage: number;
  failed: boolean;
}
interface RunResult {
  collapsed: boolean;
  failNote: string;
  firstFailure: { story: string; atHz?: number; atSeconds?: number } | null;
  peakRoofCm: number;
  peakRoofHz: number | null;
  stories: StoryResult[];
  shakeSeconds: number;
  realSeconds: number;
  fps: number;
}

const SCENARIOS: Scenario[] = [
  {
    id: 'sweep-bare',
    source: 'Guided test 2 (STOPS[1])',
    handoffClaim: 'The sweep collapses the bare frame at about 1.14 Hz.',
    config: { type: 'bare', mode: 'sweep', g: 0.2 },
    expect: (r) => r.collapsed && r.firstFailure?.atHz !== undefined && Math.abs(r.firstFailure.atHz - 1.14) <= 0.1,
  },
  {
    id: 'sweep-braced',
    source: 'Guided test 4 (STOPS[3])',
    handoffClaim: 'The braced frame survives the sweep with cracking.',
    config: { type: 'braced', mode: 'sweep', g: 0.2 },
    expect: (r) => !r.collapsed && r.stories.some((s) => s.maxDamage > 0),
  },
  {
    id: 'steady-3hz-bare',
    source: 'Guided test 3 (STOPS[2])',
    handoffClaim: 'Steady shaking at 3 Hz does nothing to the bare frame.',
    config: { type: 'bare', mode: 'steady', f: 3.0, g: 0.2 },
    shakeSeconds: 20,
    expect: (r) => !r.collapsed && r.stories.every((s) => s.maxDamage === 0),
  },
  {
    id: 'steady-3hz-bare-tour',
    source: 'Guided test 1 (STOPS[0])',
    handoffClaim: null,
    config: { type: 'bare', mode: 'steady', f: 3.0, g: 0.15 },
    shakeSeconds: 20,
    expect: () => null,
  },
  {
    id: 'steady-1.2hz-bare',
    source: 'Guided test 3 follow-up: "set Frequency to 1.2 Hz and press Shake again"',
    handoffClaim: null,
    config: { type: 'bare', mode: 'steady', f: 1.2, g: 0.2 },
    shakeSeconds: 20,
    expect: () => null,
  },
  {
    id: 'quake-bare',
    source: 'Guided test 6 (STOPS[5])',
    handoffClaim: 'The quake collapses the bare frame 6.5 s in.',
    config: { type: 'bare', mode: 'quake', g: 0.3 },
    expect: (r) => r.collapsed && r.firstFailure?.atSeconds !== undefined && Math.abs(r.firstFailure.atSeconds - 6.5) <= 0.5,
  },
  {
    id: 'quake-isolated',
    source: 'Guided test 5 (STOPS[4])',
    handoffClaim: 'The isolated building rides out the quake.',
    config: { type: 'isolated', mode: 'quake', g: 0.35 },
    expect: (r) => !r.collapsed,
  },
];

const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.md': 'text/markdown', '.json': 'application/json' };

// The repo is served to the browser through request interception, never over a socket.
// Playwright sends even loopback traffic through a configured proxy, so a local HTTP
// listener would be unreachable behind one. Only jsDelivr and Poly Haven use the network.
const ORIGIN = 'http://gravity-lab.test';

async function serveRepo(page: Page): Promise<void> {
  await page.route(`${ORIGIN}/**`, async (route) => {
    const path = normalize(decodeURIComponent(new URL(route.request().url()).pathname));
    try {
      let body: Buffer | string = await readFile(join(ROOT, path));
      if (path === '/prototype/index.html') {
        const html = body.toString('utf8');
        if (!html.includes(LAB_MARKER)) throw new Error('window.__lab marker not found in the prototype');
        body = html.replace(LAB_MARKER, PATCH);
      }
      await route.fulfill({ status: 200, contentType: MIME[extname(path)] ?? 'application/octet-stream', body });
    } catch {
      await route.fulfill({ status: 404, body: '' });
    }
  });
}

const simT = (page: Page): Promise<number> => page.evaluate(() => (window as any).__lab.simT as number);

async function waitSim(page: Page, seconds: number, realTimeoutMs = 180_000): Promise<void> {
  const start = await simT(page);
  const deadline = Date.now() + realTimeoutMs;
  while ((await simT(page)) - start < seconds) {
    if (Date.now() > deadline) throw new Error(`simulation did not advance ${seconds} s in time`);
    await page.waitForTimeout(100);
  }
}

/** Fresh world of the given type with the given shaking settings, as runStop() does. */
async function configure(page: Page, c: Scenario['config']): Promise<void> {
  await page.evaluate((c) => {
    const lab = (window as any).__lab;
    lab.setMode(c.mode);
    if (c.f !== undefined) lab.state.f = c.f;
    lab.state.g = c.g;
    lab.setType(c.type); // rebuilds the world
  }, c);
  await page.waitForTimeout(700); // runStop() waits 700 ms before starting the table
}

async function runScenario(page: Page, s: Scenario): Promise<RunResult> {
  await configure(page, s.config);
  const realStart = Date.now();
  // Sample in the page every 10 ms of real time: story drift and damage, and the first failure.
  await page.evaluate(() => {
    const w = window as any;
    const lab = w.__lab;
    const c = { stories: new Map<string, StoryResult>(), first: null as null | { story: string; fNow: number; t: number }, frames: 0 };
    w.__char = c;
    const tick = () => {
      for (const sp of lab.springs()) {
        const st = c.stories.get(sp.label) ?? { label: sp.label, maxDriftPct: 0, maxDamage: 0, failed: false };
        st.maxDriftPct = Math.max(st.maxDriftPct, sp.failed ? st.maxDriftPct : sp.r * 100);
        st.maxDamage = Math.max(st.maxDamage, sp.damage);
        if (sp.failed && !st.failed) {
          st.failed = true;
          if (!c.first) c.first = { story: sp.label, fNow: lab.shake.fNow, t: lab.shake.t };
        }
        c.stories.set(sp.label, st);
      }
    };
    w.__charTimer = setInterval(tick, 10);
    const count = () => { c.frames++; w.__charRaf = requestAnimationFrame(count); };
    w.__charRaf = requestAnimationFrame(count);
    lab.startShake();
  });

  const deadline = Date.now() + 300_000;
  let stopped = false;
  for (;;) {
    if (Date.now() > deadline) throw new Error(`${s.id}: timed out`);
    const st = await page.evaluate(() => {
      const sh = (window as any).__lab.shake;
      return { on: sh.on, t: sh.t, env: sh.env, done: sh.done };
    });
    if (s.shakeSeconds !== undefined && !stopped && st.t >= s.shakeSeconds) {
      await page.click('#shakeBtn'); // Stop, as a student would
      stopped = true;
    }
    if (st.done && st.env <= 0) break;
    await page.waitForTimeout(100);
  }
  await waitSim(page, 3); // let the building and contents come to rest

  const raw = await page.evaluate(() => {
    const w = window as any;
    clearInterval(w.__charTimer);
    cancelAnimationFrame(w.__charRaf);
    const lab = w.__lab;
    return {
      failNote: lab.shake.failNote as string,
      peakRoof: lab.shake.peakRoof as number,
      peakF: lab.shake.peakF as number,
      shakeT: lab.shake.t as number,
      first: w.__char.first,
      stories: [...w.__char.stories.values()],
      frames: w.__char.frames as number,
    };
  });
  const realSeconds = (Date.now() - realStart) / 1000;
  const first = raw.first as null | { story: string; fNow: number; t: number };
  return {
    collapsed: first !== null,
    failNote: raw.failNote,
    firstFailure: first && {
      story: first.story,
      ...(s.config.mode === 'quake' ? { atSeconds: round(first.t, 2) } : { atHz: round(first.fNow, 3) }),
    },
    peakRoofCm: round(raw.peakRoof * 100, 1),
    peakRoofHz: s.config.mode === 'quake' ? null : round(raw.peakF, 3),
    stories: (raw.stories as StoryResult[]).map((x) => ({ ...x, maxDriftPct: round(x.maxDriftPct, 2), maxDamage: round(x.maxDamage, 3) })),
    shakeSeconds: round(raw.shakeT, 2),
    realSeconds: round(realSeconds, 1),
    fps: round(raw.frames / realSeconds, 1),
  };
}

/** Builds a bare frame, never shakes it, and checks that the block wall and props stay put. */
async function wallAtRest(page: Page, seconds: number) {
  await configure(page, { type: 'bare', mode: 'steady', f: 1.2, g: 0.25 });
  type B = { kind: string; x: number; y: number; z: number; sleeping: boolean; tiltDeg: number };
  const bodies = (): Promise<B[]> => page.evaluate(() => (window as any).__lab.bodies());
  await waitSim(page, 0.5);
  const before = await bodies();
  const t0 = await simT(page);
  const timeline: { t: number; maxTiltDeg: number; maxDropCm: number; asleep: number }[] = [];
  let after = before;
  while ((await simT(page)) - t0 < seconds) {
    await waitSim(page, 0.5);
    after = await bodies();
    const blocks = after.map((a, i) => ({ a, b: before[i]! })).filter(({ b }) => b.kind === 'block');
    timeline.push({
      t: round((await simT(page)) - t0 + 0.5, 1),
      maxTiltDeg: round(Math.max(...blocks.map(({ a }) => a.tiltDeg)), 1),
      maxDropCm: round(Math.max(...blocks.map(({ a, b }) => b.y - a.y)) * 100, 1),
      asleep: blocks.filter(({ a }) => a.sleeping).length,
    });
  }
  const moved = (kind: string) => {
    const d = before
      .map((b, i) => ({ b, a: after[i]! }))
      .filter(({ b }) => b.kind === kind)
      .map(({ b, a }) => ({ dist: Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z), drop: b.y - a.y, sleeping: a.sleeping }));
    return {
      count: d.length,
      maxMoveCm: round(Math.max(0, ...d.map((x) => x.dist)) * 100, 2),
      movedOver2cm: d.filter((x) => x.dist > 0.02).length,
      droppedOver5cm: d.filter((x) => x.drop > 0.05).length,
      asleep: d.filter((x) => x.sleeping).length,
    };
  };
  const blocks = moved('block');
  return {
    handoffClaim: 'Not re-checked in the handoff: the 0.18 m wall with sleeping blocks should stand at rest.',
    simSeconds: seconds,
    blocks,
    props: moved('prop'),
    standing: blocks.droppedOver5cm === 0 && blocks.movedOver2cm === 0,
    firstTiltOver5DegAt: timeline.find((x) => x.maxTiltDeg > 5)?.t ?? null,
    timeline,
  };
}

const round = (v: number, d: number): number => Math.round(v * 10 ** d) / 10 ** d;
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

async function main(): Promise<void> {
  const html = await readFile(PROTOTYPE);
  const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
    ...(proxy ? { proxy: { server: proxy } } : {}),
  });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await serveRepo(page);
  const assetProblems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'warning' || m.type() === 'error') assetProblems.push(`${m.type()}: ${m.text()}`.slice(0, 300));
  });
  page.on('pageerror', (e) => assetProblems.push(`pageerror: ${e.message}`.slice(0, 300)));

  console.log('Loading the prototype (three.js and Rapier from jsDelivr, assets from Poly Haven)...');
  const bootStart = Date.now();
  await page.goto(`${ORIGIN}/prototype/index.html`);
  await page
    .waitForFunction(() => (window as any).__lab && document.querySelector('#loader')?.hasAttribute('hidden'), null, { timeout: 120_000 })
    .catch(async (e) => {
      console.error(`Boot did not finish. Loader says: ${await page.textContent('#loadMsg')}`);
      console.error(assetProblems.join('\n'));
      throw e;
    });
  const bootSeconds = round((Date.now() - bootStart) / 1000, 1);
  const loadMsg = await page.textContent('#loadMsg');
  console.log(`Ready in ${bootSeconds} s (${loadMsg}).`);

  // Software WebGL needs about a second per frame for this scene, and the prototype advances
  // physics at most 16 steps per rendered frame, so drawing would throttle the simulation.
  // Skip the GPU draw call only. The frame loop still runs physics at 1/240 s, mesh sync,
  // impact detection, replay recording and the UI exactly as in the prototype.
  await page.evaluate(() => {
    (window as any).__lab.renderer.render = () => {};
  });

  const want = (id: string): boolean => !ONLY || ONLY.includes(id);

  const natBeat: Record<string, number> = {};
  if (want('natural-beat')) {
    for (const type of ['bare', 'braced', 'isolated'] as const) {
      await page.evaluate((t) => (window as any).__lab.setType(t), type);
      natBeat[type] = round(await page.evaluate(() => (window as any).__lab.natBeat() as number), 4);
    }
    console.log('Natural beat readout:', natBeat);
  }

  const wall = want('wall-at-rest') ? await wallAtRest(page, 20) : null;
  if (wall) console.log(`Wall at rest: ${wall.standing ? 'standing' : 'NOT standing'}`, wall.blocks);

  const scenarios = [];
  for (const s of SCENARIOS.filter((x) => want(x.id))) {
    const runs: RunResult[] = [];
    for (let i = 0; i < REPEATS; i++) {
      const r = await runScenario(page, s);
      runs.push(r);
      console.log(`${s.id} run ${i + 1}: collapsed=${r.collapsed} first=${JSON.stringify(r.firstFailure)} peakRoof=${r.peakRoofCm} cm fps=${r.fps}`);
    }
    const verdicts = runs.map(s.expect);
    scenarios.push({
      id: s.id,
      source: s.source,
      config: s.config,
      ...(s.shakeSeconds !== undefined ? { stoppedAfterSeconds: s.shakeSeconds } : {}),
      handoffClaim: s.handoffClaim,
      matchesHandoff: s.handoffClaim === null ? null : verdicts.every(Boolean),
      summary: {
        collapsedRuns: runs.filter((r) => r.collapsed).length,
        medianPeakRoofCm: round(median(runs.map((r) => r.peakRoofCm)), 1),
        ...(runs.some((r) => r.firstFailure?.atHz !== undefined) ? { failureHz: runs.map((r) => r.firstFailure?.atHz ?? null) } : {}),
        ...(runs.some((r) => r.firstFailure?.atSeconds !== undefined) ? { failureSeconds: runs.map((r) => r.firstFailure?.atSeconds ?? null) } : {}),
      },
      runs,
    });
  }

  let replay = null;
  if (want('replay')) {
    await configure(page, { type: 'bare', mode: 'quake', g: 0.3 });
    await page.evaluate(() => (window as any).__lab.startShake());
    await waitSim(page, 10);
    replay = await page.evaluate(async () => {
      const lab = (window as any).__lab;
      const frames = lab.frameCount();
      lab.enterReplay();
      const on = lab.state.replay.on as boolean;
      const t0 = lab.state.replay.t as number;
      await new Promise((r) => setTimeout(r, 2000));
      const advanced = (lab.state.replay.t as number) > t0;
      const visible = !document.querySelector('#replaybar')!.hasAttribute('hidden');
      (document.querySelector('#rpExit') as HTMLButtonElement).click();
      return { recordedFrames: frames, entered: on, playheadAdvanced: advanced, barVisible: visible, exited: !lab.state.replay.on };
    });
    replay = { handoffClaim: 'Replay works.', ...replay, matchesHandoff: replay.entered && replay.playheadAdvanced && replay.barVisible && replay.exited };
    console.log('Replay:', replay);
  }

  const baseline = {
    note: 'Measured from prototype/index.html by scripts/characterize-prototype.ts. Phase 1 must reproduce these within tolerance. Frame rates are from headless Chromium with software WebGL and say nothing about real devices.',
    generatedAt: new Date().toISOString(),
    prototype: { file: 'prototype/index.html', sha256: createHash('sha256').update(html).digest('hex'), three: '0.181.2', rapier: '@dimforge/rapier3d-compat 0.19.3' },
    environment: { browser: `Chromium ${browser.version()} headless, SwiftShader WebGL`, render: 'draw calls skipped, frame loop and physics unchanged', repeats: REPEATS, bootSeconds },
    loadProblems: assetProblems,
    naturalBeatReadoutHz: natBeat,
    wallAtRest: wall,
    scenarios,
    replay,
  };
  await mkdir(join(ROOT, 'tests/scenarios'), { recursive: true });
  await writeFile(OUT, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`\nWrote ${OUT}`);
  for (const s of scenarios) console.log(`  ${s.matchesHandoff === null ? 'info' : s.matchesHandoff ? 'MATCH' : 'DIFFERS'}  ${s.id}${s.handoffClaim ? `: ${s.handoffClaim}` : ''}`);
  if (wall) console.log(`  ${wall.standing ? 'MATCH' : 'DIFFERS'}  wall-at-rest`);
  if (replay) console.log(`  ${replay.matchesHandoff ? 'MATCH' : 'DIFFERS'}  replay`);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
