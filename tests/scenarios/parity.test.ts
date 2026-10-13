/**
 * Phase 1 parity: the ported simulation must reproduce what the prototype measurably did
 * (tests/scenarios/baseline.json, recorded by scripts/characterize-prototype.ts).
 */
import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import baseline from './baseline.json' with { type: 'json' };
import { runScenario, type ScenarioConfig } from '../../src/shake-table/sim/scenario.ts';

beforeAll(async () => {
  await RAPIER.init();
});

type Recorded = (typeof baseline.scenarios)[number];

function configOf(s: Recorded): ScenarioConfig {
  const c = s.config as { type: ScenarioConfig['type']; mode: ScenarioConfig['mode']; f?: number; g: number };
  return { ...c, ...('stoppedAfterSeconds' in s ? { stopAfter: (s as { stoppedAfterSeconds: number }).stoppedAfterSeconds } : {}) };
}

describe('parity with the prototype baseline', () => {
  it('reports the same natural beat', async () => {
    const { ShakeTableSim } = await import('../../src/shake-table/sim/simulation.ts');
    for (const [type, hz] of Object.entries(baseline.naturalBeatReadoutHz)) {
      const sim = new ShakeTableSim(RAPIER, { type: type as ScenarioConfig['type'] });
      expect(sim.natBeat()).toBeCloseTo(hz, 3);
      sim.world.free();
    }
  });

  it.each(baseline.scenarios.map((s) => [s.id, s] as const))('%s', (_id, s) => {
    const out = runScenario(RAPIER, configOf(s));
    const ref = s.runs[0]!;
    expect(out.collapsed, 'collapse').toBe(ref.collapsed);
    if (ref.firstFailure) {
      expect(out.firstFailure?.story).toBe(ref.firstFailure.story);
      if ('atHz' in ref.firstFailure) expect(Math.abs(out.firstFailure!.atHz! - (ref.firstFailure.atHz as number))).toBeLessThanOrEqual(0.03);
      if ('atSeconds' in ref.firstFailure) expect(Math.abs(out.firstFailure!.atSeconds! - (ref.firstFailure.atSeconds as number))).toBeLessThanOrEqual(0.2);
    }
    // Damage: cracked stays cracked, undamaged stays undamaged.
    for (const st of ref.stories) {
      const mine = out.stories.find((x) => x.label === st.label)!;
      expect(mine.maxDamage > 0, `${st.label} damaged`).toBe(st.maxDamage > 0);
      expect(mine.failed, `${st.label} failed`).toBe(st.failed);
    }
    // The prototype sampled the roof once per rendered frame, the port every step.
    expect(out.peakRoofCm).toBeGreaterThanOrEqual(ref.peakRoofCm * 0.95);
    expect(out.peakRoofCm).toBeLessThanOrEqual(ref.peakRoofCm * 1.1 + 0.2);
  }, 60_000);
});
