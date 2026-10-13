// Prints a hash of every body pose over fixed runs. Run it before and after a refactor: equal hashes mean the physics is bit-identical.
import { createHash } from 'node:crypto';
import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import { ShakeTableSim } from '../src/shake-table/sim/simulation.ts';
await RAPIER.init();
for (const type of ['bare', 'braced', 'isolated'] as const) for (const mode of ['quake', 'sweep'] as const) {
  const sim = new ShakeTableSim(RAPIER, { type });
  sim.setMode(mode); sim.drive.g = mode === 'quake' ? 0.5 : 0.3; sim.start();
  const h = createHash('sha1');
  for (let i = 0; i < 240 * 14; i++) {
    sim.step();
    if (i % 60 === 0) for (const o of sim.bodies) { const t = o.body.translation(), q = o.body.rotation(); h.update(new Float64Array([t.x, t.y, t.z, q.x, q.y, q.z, q.w])); }
  }
  console.log(type, mode, sim.bodies.length, sim.natBeat().toFixed(6), h.digest('hex').slice(0, 16));
}
