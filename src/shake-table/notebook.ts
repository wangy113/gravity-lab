/**
 * The student's lab notebook: predictions, measured results and explanations. Kept in this
 * browser only (no accounts), and downloadable as a printable lab report.
 */
import { OBJECTIVES, POE } from './pedagogy.ts';
import { LEVELS, meetsLevel, type Design, type LevelId } from './specimen/design.ts';
import { STOPS } from './tour.ts';
import { resultFigure, STOP_FIGURES } from './concept-figures.ts';
import { figureHtml } from './figure.ts';

export interface RunResult {
  at: string; // ISO time
  building: string;
  shaking: string;
  strength: number; // g
  frequency: number | null; // steady frequency, Hz
  peakRoofCm: number;
  peakRoofHz: number | null;
  peakTableG: number;
  naturalBeatHz: number;
  failure: string; // empty when nothing failed
  wallBlocksDown: number;
}

export interface TestEntry {
  prediction: number | null;
  result: RunResult | null;
  explanation: string;
}

/** One test of the student's own building in the design challenge. */
export interface DesignAttempt {
  at: string; // ISO time
  name: string;
  design: Design;
  cost: number; // credits
  prediction: 'survive' | 'collapse' | null;
  survived: boolean;
  maxDriftPct: number; // largest story drift before any failure
  /** Largest permanent lean after the test, drift ratio in percent (Model 2 designs). */
  residualPct?: number;
  failure: string; // empty when nothing failed
}

export interface Notebook {
  student: string;
  tests: TestEntry[]; // one per guided test
  explore: RunResult[]; // free runs, newest last
  designs: DesignAttempt[]; // design challenge attempts, newest last
  designExplanation: string;
}

/** The level an attempt belongs to (attempts saved before levels existed were level 1). */
export const attemptLevel = (a: DesignAttempt): LevelId => a.design.level ?? 1;

/** The cheapest design that met a level (survived, drift limit, budget), if any. */
export function bestDesign(n: Notebook, level: LevelId): DesignAttempt | null {
  return n.designs.filter((a) => attemptLevel(a) === level && meetsLevel(level, a)).sort((a, b) => a.cost - b.cost)[0] ?? null;
}

/** The level's goal in one sentence. */
export function levelGoal(level: LevelId): string {
  const L = LEVELS[level];
  return `a ${L.stories}-story building that survives a ${L.g} g quake${L.maxDriftPct !== null ? ` with no story drifting more than ${L.maxDriftPct}%` : ''}, for ${L.budget} credits or less`;
}

const KEY = 'shake-table-lab.notebook.v1';

export function emptyNotebook(): Notebook {
  return { student: '', tests: STOPS.map(() => ({ prediction: null, result: null, explanation: '' })), explore: [], designs: [], designExplanation: '' };
}

export function loadNotebook(): Notebook {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyNotebook();
    const n = JSON.parse(raw) as Notebook;
    const base = emptyNotebook();
    return { ...base, ...n, tests: base.tests.map((t, i) => ({ ...t, ...n.tests?.[i] })) };
  } catch {
    return emptyNotebook();
  }
}

export function saveNotebook(n: Notebook): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(n));
  } catch {
    // Storage can be unavailable (private windows). The download still works.
  }
}

export function describeResult(r: RunResult): string[] {
  const lines = [
    `${r.building}, ${r.shaking.toLowerCase()} shaking at ${r.strength.toFixed(2)} g${r.frequency ? ` and ${r.frequency.toFixed(2)} Hz` : ''}`,
    `Biggest roof swing: ${r.peakRoofCm.toFixed(0)} cm${r.peakRoofHz ? ` at ${r.peakRoofHz.toFixed(2)} Hz` : ''}`,
    `Peak table acceleration: ${r.peakTableG.toFixed(2)} g`,
    `Natural beat before the test: ${r.naturalBeatHz.toFixed(2)} Hz`,
    r.failure ? `Failure: ${r.failure}` : 'No story failed',
    r.wallBlocksDown > 0 ? `Block wall: ${r.wallBlocksDown} blocks fell` : 'Block wall: standing',
  ];
  return lines;
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** A self-contained HTML lab report the student can print to PDF or upload to Canvas. */
export function reportHtml(n: Notebook): string {
  const tests = STOPS.map((s, i) => {
    const t = n.tests[i]!, p = POE[i]!;
    const pred = t.prediction === null ? '<em>No prediction recorded</em>' : esc(p.predict.options[t.prediction]!);
    const result = t.result ? `<ul>${describeResult(t.result).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : '<p><em>Test not run</em></p>';
    return `<section><h2>Test ${i + 1}. ${esc(s.title)}</h2>
<p class="obj"><b>Objective:</b> ${esc(p.objective)} (${p.objectiveIds.join(', ')})</p>
${figureHtml(STOP_FIGURES[i]!.setup)}
<h3>Predict</h3><p>${esc(p.predict.question)}</p><p><b>My prediction:</b> ${pred}</p>
<h3>Observe</h3>${result}${figureHtml(resultFigure(i, t.result))}
<h3>Explain</h3><p class="q">${esc(p.explain)}</p><div class="ans">${t.explanation ? esc(t.explanation).replace(/\n/g, '<br>') : '<em>No explanation yet</em>'}</div>
</section>`;
  }).join('\n');
  const explore = n.explore.length
    ? `<section><h2>Free exploration runs</h2><table><tr><th>Building</th><th>Shaking</th><th>Roof swing</th><th>Failure</th></tr>${n.explore
        .map((r) => `<tr><td>${esc(r.building)}</td><td>${esc(r.shaking)} ${r.strength.toFixed(2)} g${r.frequency ? ` ${r.frequency.toFixed(2)} Hz` : ''}</td><td>${r.peakRoofCm.toFixed(0)} cm</td><td>${esc(r.failure || 'none')}</td></tr>`)
        .join('')}</table></section>`
    : '';
  const levelSection = (level: LevelId): string => {
    const L = LEVELS[level], tries = n.designs.filter((a) => attemptLevel(a) === level), best = bestDesign(n, level);
    if (!tries.length) return '';
    return `<h3>Level ${level}. ${esc(L.title)}</h3><p class="obj"><b>Goal:</b> ${esc(levelGoal(level))}.</p>
<p><b>Best design:</b> ${best ? `${esc(best.name)}, ${best.cost} credits` : '<em>none survived within the budget yet</em>'}</p>
<table><tr><th>Design</th><th>Cost</th><th>Predicted</th><th>Result</th><th>Largest drift</th><th>Lasting lean</th></tr>${tries
        .map((a) => `<tr><td>${esc(a.name)}</td><td>${a.cost}</td><td>${a.prediction ?? 'none'}</td><td>${a.survived ? 'survived' : esc(a.failure)}</td><td>${a.maxDriftPct.toFixed(1)}%</td><td>${a.survived && a.residualPct !== undefined ? `${a.residualPct.toFixed(1)}%` : ''}</td></tr>`)
        .join('')}</table>`;
  };
  const designs = n.designs.length
    ? `<section><h2>Design challenge</h2>${levelSection(1)}${levelSection(2)}
<h3>Explain</h3><p class="q">What made your best design work, and what did a failed design teach you?</p><div class="ans">${n.designExplanation ? esc(n.designExplanation).replace(/\n/g, '<br>') : '<em>No explanation yet</em>'}</div></section>`
    : '';
  const done = n.tests.filter((t) => t.result).length;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Shake Table Lab report</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#111}h1{margin:0}h2{margin-top:28px;border-bottom:2px solid #ffb020;padding-bottom:4px}h3{margin:14px 0 4px;font-size:15px;text-transform:uppercase;letter-spacing:.06em;color:#555}.obj{background:#f4f6f8;padding:6px 10px;border-radius:6px}.q{color:#444}.ans{border-left:4px solid #4cc9f0;padding:6px 10px;background:#f7fbfd;white-space:normal}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:4px 8px;text-align:left}figure.fig{margin:10px 0;max-width:420px}figure.fig svg{width:100%;height:auto;display:block}figcaption{font-size:13px;color:#444;margin-top:4px}@media print{figure.fig{break-inside:avoid}h2{break-after:avoid}section{break-inside:avoid}}</style>
</head><body><h1>Shake Table Lab report</h1>
<p><b>Student:</b> ${esc(n.student || 'not given')}<br><b>Date:</b> ${new Date().toLocaleDateString()}<br><b>Tests completed:</b> ${done} of ${STOPS.length}</p>
<h2>Learning objectives</h2><ul>${OBJECTIVES.map((o) => `<li><b>${o.id}</b> ${esc(o.text)}</li>`).join('')}</ul>
${tests}
${designs}
${explore}
<p style="margin-top:32px;color:#666;font-size:13px">Made with the Shake Table Lab, a virtual earthquake engineering lab. The model is simplified for teaching and is not a design tool.</p>
</body></html>`;
}

export function downloadReport(n: Notebook): void {
  const blob = new Blob([reportHtml(n)], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `shake-table-lab-report${n.student ? `-${n.student.trim().replace(/\s+/g, '-').toLowerCase()}` : ''}.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
