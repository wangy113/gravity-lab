// Runs candidate designs through the quake to calibrate the design challenge (docs/ARCHITECTURE.md 16.4).
import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import { runScenario } from '../src/shake-table/sim/scenario.ts';
import { compileSpecimen } from '../src/shake-table/specimen/compile.ts';
import { designCost, designName, designSpec, type Design, type FrameChoice } from '../src/shake-table/specimen/design.ts';
await RAPIER.init();
const g = +(process.argv[2] ?? 0.4);
const F: FrameChoice[] = ['light', 'heavy', 'braced'];
const designs: Design[] = [];
for (const a of F) for (const b of F) for (const c of F) if (F.indexOf(a) >= F.indexOf(b) && F.indexOf(b) >= F.indexOf(c)) {
  designs.push({ frames: [a, b, c], dampers: [false, false, false], isolated: false });
  designs.push({ frames: [a, b, c], dampers: [true, false, false], isolated: false });
  designs.push({ frames: [a, b, c], dampers: [true, true, true], isolated: false });
}
designs.push({ frames: ['light', 'light', 'light'], dampers: [false, false, false], isolated: true });
designs.push({ frames: ['braced', 'braced', 'braced'], dampers: [false, false, false], isolated: true });
for (const d of designs) {
  const spec = designSpec(d);
  const f1 = compileSpecimen(spec).modes[0]!;
  const r = runScenario(RAPIER, { type: 'custom', spec, mode: 'quake', g });
  console.log(`${designCost(d).toString().padStart(4)}  ${f1.toFixed(2)} Hz  ${r.collapsed ? 'FAIL' : 'ok  '}  drift ${r.stories.map((s) => s.maxDriftPct.toFixed(1)).join('/')}  ${designName(d)}`);
}
