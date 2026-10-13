/**
 * The block wall must stand at rest and in gentle shaking, and come down in a strong quake.
 * On Rapier 0.19.3 it fell over by itself after about 5 s (see docs/ARCHITECTURE.md 16.1).
 */
import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ShakeMode } from '../../src/shake-table/motion/table.ts';
import { ShakeTableSim } from '../../src/shake-table/sim/simulation.ts';

beforeAll(async () => {
  await RAPIER.init();
});

function fallenBlocks(seconds: number, shake?: { mode: ShakeMode; f?: number; g: number }): number {
  const sim = new ShakeTableSim(RAPIER, { type: 'bare' });
  const blocks = sim.bodies.filter((o) => o.kind === 'block');
  const y0 = blocks.map((o) => o.body.translation().y);
  if (shake) {
    sim.setMode(shake.mode);
    if (shake.f) sim.drive.f = shake.f;
    sim.drive.g = shake.g;
    sim.start();
  }
  for (let i = 0; i < seconds * 240; i++) {
    if (shake?.mode === 'steady' && sim.drive.t >= 20 && sim.drive.on) sim.stop();
    sim.step();
  }
  const n = blocks.filter((o, i) => y0[i]! - o.body.translation().y > 0.1).length;
  sim.world.free();
  return n;
}

describe('block wall', () => {
  it('stands at rest for 30 s', () => expect(fallenBlocks(30)).toBe(0), 60_000);
  it('stands through steady 3 Hz shaking at 0.2 g', () => expect(fallenBlocks(25, { mode: 'steady', f: 3, g: 0.2 })).toBe(0), 60_000);
  it('comes down in a 0.4 g quake', () => expect(fallenBlocks(28, { mode: 'quake', g: 0.4 })).toBeGreaterThan(30), 60_000);
});
