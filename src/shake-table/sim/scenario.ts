import type RAPIER_NS from '@dimforge/rapier3d-deterministic-compat';
import type { BuildingType } from '../constants.ts';
import type { QuakeKind } from '../motion/quake.ts';
import type { ShakeMode } from '../motion/table.ts';
import type { SpecimenSpec } from '../specimen/spec.ts';
import { ShakeTableSim, type SimOptions } from './simulation.ts';

export interface ScenarioConfig {
  type: BuildingType;
  /** The design to test when `type` is 'custom'. */
  spec?: SpecimenSpec;
  mode: ShakeMode;
  /** Which synthetic quake (quake mode only). */
  quake?: QuakeKind;
  f?: number;
  g: number;
  /** Steady shaking never ends by itself, so it is stopped after this many seconds. */
  stopAfter?: number;
}

export interface StoryOutcome { label: string; maxDriftPct: number; maxDamage: number; failed: boolean }
export interface ScenarioOutcome {
  collapsed: boolean;
  firstFailure: { story: string; atHz?: number; atSeconds?: number } | null;
  failNote: string;
  peakRoofCm: number;
  stories: StoryOutcome[];
  shakeSeconds: number;
}

/**
 * Runs one test the way a student does in the prototype: build, wait 0.7 s (runStop's delay),
 * Shake, wait for the table to stop, then let things settle for 3 s.
 */
export function runScenario(R: typeof RAPIER_NS, c: ScenarioConfig, opts: SimOptions = {}): ScenarioOutcome {
  const sim = new ShakeTableSim(R, { ...opts, type: c.type, ...(c.spec ? { spec: c.spec } : {}) });
  sim.setMode(c.mode);
  if (c.quake) sim.drive.quakeKind = c.quake;
  if (c.f !== undefined) sim.drive.f = c.f;
  sim.drive.g = c.g;
  for (let i = 0; i < Math.round(0.7 * 240); i++) sim.step();
  sim.start();
  const stories = new Map<string, StoryOutcome>();
  let first: ScenarioOutcome['firstFailure'] = null;
  const track = (): void => {
    for (const s of sim.springs) {
      if (s.tmd) continue; // the roof damper is not a story
      const st = stories.get(s.label) ?? { label: s.label, maxDriftPct: 0, maxDamage: 0, failed: false };
      if (!s.failed) st.maxDriftPct = Math.max(st.maxDriftPct, s.r * 100);
      st.maxDamage = Math.max(st.maxDamage, s.damage);
      if (s.failed && !st.failed) {
        st.failed = true;
        first ??= { story: s.label, ...(c.mode === 'quake' ? { atSeconds: sim.drive.t } : { atHz: sim.drive.fNow }) };
      }
      stories.set(s.label, st);
    }
  };
  let guard = 0;
  while (!(sim.drive.done && sim.drive.env <= 0)) {
    if (c.stopAfter !== undefined && sim.drive.on && sim.drive.t >= c.stopAfter) sim.stop();
    sim.step();
    track();
    if (++guard > 240 * 120) throw new Error('scenario did not finish');
  }
  const shakeSeconds = sim.drive.t;
  for (let i = 0; i < 3 * 240; i++) { sim.step(); track(); }
  const out: ScenarioOutcome = {
    collapsed: first !== null,
    firstFailure: first,
    failNote: sim.failNote,
    peakRoofCm: sim.peakRoof * 100,
    stories: [...stories.values()],
    shakeSeconds,
  };
  sim.world.free();
  return out;
}
