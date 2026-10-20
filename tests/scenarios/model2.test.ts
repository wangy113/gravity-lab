/**
 * Model 2 (docs/ARCHITECTURE.md 5.3): support springs fixed per story, the bilinear law and
 * P-Delta. Checked against the linear model and against the behavior each part should add.
 */
import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { DT } from '../../src/shake-table/constants.ts';
import { ShakeTableSim } from '../../src/shake-table/sim/simulation.ts';
import { compileSpecimen } from '../../src/shake-table/specimen/compile.ts';
import { shearBuildingFrequencies } from '../../src/shake-table/specimen/modal.ts';
import { PRESETS, type SpecimenSpec, type StorySpec } from '../../src/shake-table/specimen/spec.ts';

beforeAll(async () => {
  await RAPIER.init();
});

const LIGHT_K = 1.14e6;
function tower(n: number, k = LIGHT_K, version: 1 | 2 = 2): SpecimenSpec {
  const story = (): StorySpec => ({
    ...structuredClone(PRESETS.bare.stories[0]!),
    lateral: { kind: 'story', k, law: version === 2
      ? { kind: 'bilinear', yieldDrift: 0.01, ultimateDrift: 0.06, hardening: 0.05, capacity: 6 }
      : { kind: 'prototype-damage', yieldDrift: 0.02, ultimateDrift: 0.06 } },
  });
  return { ...structuredClone(PRESETS.bare), modelVersion: version, stories: Array.from({ length: n }, story) };
}

/** Rings the building by kicking the roof, and measures its period from roof-swing zero crossings. */
function ringHz(spec: SpecimenSpec): number {
  const sim = new ShakeTableSim(RAPIER, { type: 'custom', spec });
  for (let i = 0; i < 240; i++) sim.step(); // settle under gravity
  const top = sim.levels.at(-1)!;
  top.body.setLinvel({ x: 0.15, y: 0, z: 0 }, true);
  const crossings: number[] = [];
  let prev = sim.roofSwing();
  for (let i = 0; i < 240 * 8; i++) {
    sim.step();
    const r = sim.roofSwing();
    if (prev < 0 && r >= 0) crossings.push(sim.simT);
    prev = r;
  }
  sim.world.free();
  const periods = crossings.slice(1).map((t, i) => t - crossings[i]!);
  return 1 / (periods.reduce((a, b) => a + b, 0) / periods.length);
}

describe('Model 2', { timeout: 60_000 }, () => {
  it('rings at the first mode the linear model predicts, within 2%', () => {
    for (const n of [3, 5]) {
      const spec = tower(n);
      const predicted = compileSpecimen(spec).modes[0]!;
      expect(Math.abs(ringHz(spec) / predicted - 1)).toBeLessThan(0.02);
    }
  });

  it('keeps tall buildings stable: a 6-story tower stands still at rest', () => {
    const spec = tower(6, 6.84e6);
    expect(compileSpecimen(spec).stability.ok).toBe(true);
    expect(() => compileSpecimen(tower(6, 6.84e6, 1))).toThrow(/Try fewer stories/); // Model 1 cannot
    const sim = new ShakeTableSim(RAPIER, { type: 'custom', spec });
    for (let i = 0; i < 240 * 5; i++) sim.step();
    // Positions, not velocities: the velocity Rapier reports after a step includes one step of
    // gravity that the next support impulse cancels, so a still floor reads about 2 cm/s.
    const before = sim.levels.map((o) => ({ ...o.body.translation() }));
    for (let i = 0; i < 240 * 10; i++) sim.step();
    expect(Math.abs(sim.roofSwing())).toBeLessThan(0.005);
    sim.levels.forEach((o, i) => {
      const p = o.body.translation(), q = before[i]!;
      expect(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)).toBeLessThan(0.002);
    });
    sim.world.free();
  });

  it('P-Delta makes the building swing slower', () => {
    const withPD = compileSpecimen(tower(5));
    const springs = withPD.springs;
    // weight of the floors above over the story height (2.05 m for the ground story, which stands on the thicker table)
    expect(springs[0]!.pDelta).toBeCloseTo((9.81 * 4000 * 5) / springs[0]!.rest.y, 6);
    expect(springs.at(-1)!.pDelta).toBeCloseTo((9.81 * 4000) / 2.0, 6);
    const frameOnly = shearBuildingFrequencies(withPD.floors.map((f) => f.mass), springs.map((s) => s.k))[0]!;
    expect(withPD.modes[0]!).toBeLessThan(frameOnly * 0.98);
  });

  it('when a story wears out, the floors above come down (broken columns do not prop them up)', () => {
    // Steady shaking near resonance wears the ground story out at a small drift.
    const sim = new ShakeTableSim(RAPIER, { type: 'custom', spec: tower(3) });
    const y0 = sim.levels.map((o) => o.body.translation().y);
    sim.setMode('steady'); sim.drive.f = 1.1; sim.drive.g = 0.15; sim.start();
    for (let i = 0; i < 240 * 20 && !sim.anyFailed; i++) sim.step();
    expect(sim.anyFailed).toBe(true);
    const failed = sim.springs.findIndex((s) => s.failed);
    sim.stop();
    for (let i = 0; i < 240 * 6; i++) sim.step();
    // the floor the failed story held up has dropped by most of a story height
    const drop = y0[failed]! - sim.levels[failed]!.body.translation().y;
    expect(drop).toBeGreaterThan(1.0);
    sim.world.free();
  });

  it('a yielded story keeps a permanent lean after the shaking stops', () => {
    const lean = (spec: SpecimenSpec): { failed: boolean; residual: number } => {
      const sim = new ShakeTableSim(RAPIER, { type: 'custom', spec });
      sim.setMode('steady'); sim.drive.f = 1.5; sim.drive.g = 0.2; sim.start(); // off resonance: yields, does not break
      for (let i = 0; i < 240 * 12; i++) sim.step();
      sim.stop();
      for (let i = 0; i < 240 * 12; i++) sim.step(); // ring down
      const out = { failed: sim.anyFailed, residual: Math.max(...sim.springs.map((s) => Math.abs(sim.residualDrift(s)))) };
      sim.world.free();
      return out;
    };
    const v2 = lean(tower(3));
    expect(v2.failed).toBe(false);
    expect(v2.residual).toBeGreaterThan(0.002); // over 0.2% drift, about 4 mm, stays
    expect(DT).toBe(1 / 240);
  });
});
