// Runs candidate designs through a level's quake to calibrate the design challenge (docs/ARCHITECTURE.md 16.4).
//   node scripts/calibrate-design.ts 1        all frame and damper combinations for level 1
//   node scripts/calibrate-design.ts 2        level 2: stiffness never rising upward, plus soft-story cases
import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import { runScenario } from '../src/shake-table/sim/scenario.ts';
import { compileSpecimen } from '../src/shake-table/specimen/compile.ts';
import { designCost, designName, designSpec, LEVELS, type Design, type FrameChoice, type LevelId } from '../src/shake-table/specimen/design.ts';
await RAPIER.init();
const level = +(process.argv[2] ?? 1) as LevelId;
const { stories: n, g, quake } = LEVELS[level];
const F: FrameChoice[] = ['light', 'heavy', 'braced'];
const rank = (f: FrameChoice): number => F.indexOf(f);

// Frame sequences: every one for level 1, for level 2 the ones whose stiffness never rises
// going up, plus a few with a weak story in the middle.
const seqs: FrameChoice[][] = [];
const walk = (s: FrameChoice[]): void => {
  if (s.length === n) { seqs.push(s); return; }
  for (const f of F) if (level === 1 || !s.length || rank(f) <= rank(s.at(-1)!)) walk([...s, f]);
};
walk([]);
if (level === 2) seqs.push(['braced', 'braced', 'light', 'braced', 'braced'], ['heavy', 'heavy', 'light', 'heavy', 'heavy']);
// A quick look: node scripts/calibrate-design.ts 2 quick
if (process.argv[3] === 'quick') seqs.splice(0, seqs.length, ...(process.argv[4] ?? 'LLLLL,HLLLL,HHLLL,HHHLL,HHHHL,HHHHH,BLLLL,BBLLL,BHHLL,BBHHL,BBBBB').split(',').map((c) => [...c].map((ch) => ({ L: 'light', H: 'heavy', B: 'braced' })[ch] as FrameChoice)));
const damperSets = (k: number): boolean[][] => [
  Array(k).fill(false),
  [true, ...Array(k - 1).fill(false)],
  [true, true, ...Array(k - 2).fill(false)],
  Array(k).fill(true),
];
const designs: Design[] = [];
for (const s of seqs) for (const dmp of damperSets(n)) designs.push({ level, frames: s, dampers: dmp, isolated: false });
designs.push({ level, frames: Array(n).fill('light'), dampers: Array(n).fill(false), isolated: true });
// Every frame sequence again with a tuned mass damper on the roof, and no story dampers.
for (const s of seqs) designs.push({ level, frames: s, dampers: Array(n).fill(false), isolated: false, tmd: true });

const rows: string[] = [];
for (const d of designs) {
  const spec = designSpec(d);
  let f1 = 0;
  try { f1 = compileSpecimen(spec).modes[0]!; } catch (e) { rows.push(`${designCost(d)}  REJECTED ${(e as Error).message}  ${designName(d)}`); continue; }
  const r = runScenario(RAPIER, { type: 'custom', spec, mode: 'quake', quake, g });
  rows.push(`${designCost(d).toString().padStart(5)}  ${f1.toFixed(2)} Hz  ${r.collapsed ? 'FAIL' : 'ok  '}  drift ${r.stories.map((s) => s.maxDriftPct.toFixed(1)).join('/')}  ${designName(d)}`);
}
console.log(rows.sort((a, b) => parseInt(a) - parseInt(b)).join('\n'));
