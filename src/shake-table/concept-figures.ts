/**
 * One labeled diagram per guided test, in the same order as STOPS in tour.ts. Each one
 * draws the idea the test's text explains, with the same words as labels, so students
 * code the idea both verbally and visually (dual coding, see figure.ts).
 */
import { arrow, C, label, shakeArrow, svg, type Figure } from './figure.ts';

/**
 * A shear building seen from the side: slabs joined by columns. sway[k] is how far floor
 * k (0 is the base) sits to the right, so a swaying building is drawn as a bent frame.
 */
function frame(x: number, baseY: number, w: number, storyH: number, sway: number[], color: string = C.cyan, opts: { braced?: boolean; broken?: number } = {}): string {
  let s = '';
  for (let k = 0; k < sway.length; k++) {
    const y = baseY - k * storyH, o = sway[k]!;
    s += `<line x1="${x + o - 4}" y1="${y}" x2="${x + w + o + 4}" y2="${y}" stroke="currentColor" stroke-width="5"/>`;
    if (k === 0) continue;
    const yb = y + storyH, ob = sway[k - 1]!, col = opts.broken === k ? C.red : color;
    const dash = opts.broken === k ? ' stroke-dasharray="4 4"' : '';
    s += `<line x1="${x + ob}" y1="${yb}" x2="${x + o}" y2="${y}" stroke="${col}" stroke-width="3"${dash}/>`;
    s += `<line x1="${x + w + ob}" y1="${yb}" x2="${x + w + o}" y2="${y}" stroke="${col}" stroke-width="3"${dash}/>`;
    if (opts.braced) {
      s += `<line x1="${x + ob}" y1="${yb}" x2="${x + w + o}" y2="${y}" stroke="${C.steel}" stroke-width="2"/>`;
      s += `<line x1="${x + w + ob}" y1="${yb}" x2="${x + o}" y2="${y}" stroke="${C.steel}" stroke-width="2"/>`;
    }
  }
  return s;
}

/** A small sine wave of n cycles across width w, centred on y. */
function wave(x: number, y: number, w: number, amp: number, cycles: number, color: string = C.amber): string {
  const pts: string[] = [];
  for (let i = 0; i <= 120; i++) {
    const t = i / 120;
    pts.push(`${(x + t * w).toFixed(1)},${(y - amp * Math.sin(2 * Math.PI * cycles * t)).toFixed(1)}`);
  }
  return `<polyline points="${pts.join(' ')}" stroke="${color}" stroke-width="2"/>`;
}

/** Roof swing against shaking frequency for a damped oscillator with natural frequency fn. */
function responseCurve(fn: number, x0: number, y0: number, w: number, h: number, fMax: number, color: string, zeta = 0.08, scale = 1): string {
  const pts: string[] = [];
  const peak = 1 / (2 * zeta);
  for (let i = 0; i <= 160; i++) {
    const f = 0.2 + (i / 160) * (fMax - 0.2), r = f / fn;
    const amp = 1 / Math.sqrt((1 - r * r) ** 2 + (2 * zeta * r) ** 2);
    const px = x0 + (f / fMax) * w, py = y0 - Math.min(1, (scale * amp) / peak) * h;
    pts.push(`${px.toFixed(1)},${py.toFixed(1)}`);
  }
  return `<polyline points="${pts.join(' ')}" stroke="${color}" stroke-width="2.5"/>`;
}

/** Frequency axes for the two resonance figures. */
function freqAxes(x0: number, y0: number, w: number, h: number, fMax: number, ticks: number[]): string {
  let s = arrow(x0, y0, x0 + w + 12, y0) + arrow(x0, y0, x0, y0 - h - 12);
  for (const f of ticks) {
    const px = x0 + (f / fMax) * w;
    s += `<line x1="${px}" y1="${y0}" x2="${px}" y2="${y0 + 4}" stroke="currentColor"/>` + label(px, y0 + 16, `${f}`, 'middle');
  }
  s += label(x0 + w + 12, y0 + 16, 'Hz', 'end');
  s += label(x0 - 6, y0 - h / 2, 'Roof swing', 'middle', `transform="rotate(-90 ${x0 - 6} ${y0 - h / 2})" dy="-4"`);
  return s;
}

/** The reaction wall, actuator, chrome rod and steel table, as in the test hall. */
function table(): string {
  return `<rect x="14" y="70" width="18" height="78" fill="currentColor" fill-opacity=".18" stroke="currentColor"/>` +
    `<line x1="10" y1="148" x2="310" y2="148" stroke="currentColor" stroke-width="1.5"/>` +
    `<rect x="32" y="118" width="46" height="16" rx="3" fill="${C.steel}" fill-opacity=".5" stroke="currentColor"/>` +
    `<line x1="78" y1="126" x2="104" y2="126" stroke="${C.steel}" stroke-width="5"/>` +
    `<rect x="104" y="116" width="150" height="20" rx="2" fill="${C.amber}" fill-opacity=".35" stroke="${C.amber}" stroke-width="2"/>` +
    shakeArrow(179, 144, 30) +
    label(36, 96, 'hydraulic', 'start') + label(36, 110, 'actuator', 'start') +
    label(91, 162, 'chrome rod', 'middle') +
    label(262, 131, 'steel table', 'start');
}

/**
 * The setup of each test, shown beside the reading in Predict. It pictures the idea the
 * text explains, but not the outcome, so it does not give the prediction away.
 */
const SETUPS: Figure[] = [
  {
    alt: 'A hydraulic actuator pushes a steel table back and forth through a chrome rod. A three-story steel frame is bolted to the table.',
    caption: 'The actuator pushes the steel table back and forth through its chrome rod. The building is bolted to the table.',
    svg: svg('A hydraulic actuator pushes a steel table back and forth through a chrome rod. A three-story steel frame is bolted to the table.',
      table() + frame(132, 116, 94, 28, [0, 0, 0, 0]) +
      label(244, 50, 'three-story', 'start') + label(244, 64, 'steel frame', 'start') +
      arrow(242, 56, 230, 56, 'currentColor', 1.2) +
      label(179, 14, 'shakes steadily at 3 Hz', 'middle'),
      340),
  },
  {
    alt: 'A building swaying on its own at its natural beat, with pushes timed to each swing. Below, a frequency scale from 0.6 to 4 hertz shows the sweep speeding up.',
    caption: 'The natural beat is the rhythm the building sways at on its own. Pushes in time with it add to every swing. The sweep tries every frequency from 0.6 Hz to 4 Hz.',
    svg: svg('A building swaying on its own at its natural beat, with pushes timed to each swing. Below, a frequency scale from 0.6 to 4 hertz shows the sweep speeding up.',
      // the building at both ends of its own swing
      `<g opacity=".4">${frame(40, 100, 50, 26, [0, -6, -12, -16])}</g>` + frame(40, 100, 50, 26, [0, 6, 12, 16]) +
      shakeArrow(65, 14, 28, C.cyan) +
      label(150, 34, 'natural beat:', 'start', 'font-weight="700"') +
      label(150, 48, 'the rhythm it sways at', 'start') + label(150, 62, 'on its own', 'start') +
      arrow(146, 82, 110, 82, C.amber, 2.5) + label(150, 86, 'a push in time with', 'start') + label(150, 100, 'the swing adds to it', 'start') +
      // the sweep
      arrow(20, 134, 300, 134) +
      [0.6, 2, 3, 4].map((f) => `<line x1="${20 + ((f - 0.4) / 3.9) * 270}" y1="130" x2="${20 + ((f - 0.4) / 3.9) * 270}" y2="138" stroke="currentColor"/>` + label(20 + ((f - 0.4) / 3.9) * 270, 152, `${f} Hz`, 'middle', 'font-size="11"')).join('') +
      wave(20 + (0.2 / 3.9) * 270, 120, 270 * 3.4 / 3.9, 6, 9, C.amber) +
      label(160, 168, 'the sweep: slow, then faster', 'middle'),
      320, 176),
  },
  {
    alt: 'Two shaking signals of the same height, so the same strength. One shakes at 3 hertz, the other at 1.2 hertz, the building\'s natural beat.',
    caption: 'The two signals have the same strength, shown by their height. They differ only in frequency, how many shakes there are each second.',
    svg: svg('Two shaking signals of the same height, so the same strength. One shakes at 3 hertz, the other at 1.2 hertz, the building\'s natural beat.',
      label(14, 40, '3 Hz', 'start', 'font-weight="700"') + wave(70, 40, 230, 18, 7.5) +
      label(14, 112, '1.2 Hz', 'start', 'font-weight="700"') + wave(70, 112, 230, 18, 3) +
      label(14, 128, 'natural beat', 'start', 'font-size="11"') +
      arrow(306, 40, 306, 22, 'currentColor', 1.2) + arrow(306, 40, 306, 58, 'currentColor', 1.2) +
      arrow(306, 112, 306, 94, 'currentColor', 1.2) + arrow(306, 112, 306, 130, 'currentColor', 1.2) +
      label(185, 160, 'same strength (height), different frequency', 'middle'),
      320, 170),
  },
  {
    alt: 'Two three-story frames side by side. The bare frame has only columns. The braced frame has steel X-braces in every story, making each story about six times stiffer.',
    caption: 'Steel X-braces make each story about six times stiffer than the bare frame. A stiffer building has a faster natural beat.',
    svg: svg('Two three-story frames side by side. The bare frame has only columns. The braced frame has steel X-braces in every story, making each story about six times stiffer.',
      frame(14, 130, 76, 32, [0, 0, 0, 0]) + label(52, 152, 'bare frame', 'middle') + label(52, 166, 'natural beat 1.2 Hz', 'middle', 'font-size="11"') +
      frame(230, 130, 76, 32, [0, 0, 0, 0], C.cyan, { braced: true }) + label(268, 152, 'braced frame', 'middle') + label(268, 166, 'faster beat', 'middle', 'font-size="11"') +
      label(160, 60, 'X-braces:', 'middle', 'font-weight="700"') + label(160, 74, 'about six times', 'middle') + label(160, 88, 'stiffer', 'middle') +
      arrow(196, 84, 238, 100, 'currentColor', 1.2),
      320, 174),
  },
  {
    alt: 'A three-story building sitting on soft rubber bearings, with floor 2 marked. The bearings are soft side to side.',
    caption: 'Base isolation sets the building on rubber bearings that are soft side to side. The camera rides on floor 2.',
    svg: svg('A three-story building sitting on soft rubber bearings, with floor 2 marked. The bearings are soft side to side.',
      `<rect x="70" y="136" width="170" height="12" fill="${C.amber}" fill-opacity=".35" stroke="${C.amber}" stroke-width="2"/>` +
      label(155, 166, 'ground', 'middle') +
      [100, 155, 210].map((bx) => `<rect x="${bx - 10}" y="118" width="16" height="18" fill="${C.steel}" fill-opacity=".6" stroke="currentColor"/>`).join('') +
      arrow(150, 127, 162, 127, 'currentColor', 1) + arrow(150, 127, 138, 127, 'currentColor', 1) +
      label(14, 124, 'rubber', 'start') + label(14, 138, 'bearings', 'start') +
      arrow(64, 128, 82, 128, 'currentColor', 1.2) +
      frame(86, 118, 116, 28, [0, 0, 0, 0]) +
      label(230, 66, 'floor 2', 'start') + arrow(226, 62, 210, 62, 'currentColor', 1.2) +
      label(230, 116, 'soft side', 'start') + label(230, 130, 'to side', 'start'),
      320, 176),
  },
  {
    alt: 'The test scene split into parts. The steel frame is the structure. The unreinforced block wall, furniture and shelves are nonstructural parts.',
    caption: 'Structure in blue holds the building up. Nonstructural parts in amber, the block wall, furniture and shelves, are not part of the structure.',
    svg: svg('The test scene split into parts. The steel frame is the structure. The unreinforced block wall, furniture and shelves are nonstructural parts.',
      frame(30, 120, 80, 30, [0, 0, 0, 0], C.cyan) +
      `<rect x="44" y="96" width="16" height="24" fill="${C.amber}" fill-opacity=".45" stroke="${C.amber}"/>` +
      `<rect x="78" y="70" width="22" height="20" fill="${C.amber}" fill-opacity=".45" stroke="${C.amber}"/>` +
      [0, 1, 2, 3, 4, 5].map((r) => [0, 1].map((c) => `<rect x="${140 + c * 18 + (r % 2) * 9}" y="${108 - r * 12}" width="18" height="12" fill="${C.amber}" fill-opacity=".25" stroke="${C.amber}"/>`).join('')).join('') +
      label(70, 140, 'structure', 'middle') + label(70, 154, 'steel frame', 'middle', 'font-size="11"') +
      label(162, 140, 'block wall', 'middle') + label(162, 154, 'no steel inside', 'middle', 'font-size="11"') +
      label(214, 46, 'nonstructural', 'start', 'font-weight="700"') + label(214, 60, 'parts: wall,', 'start') + label(214, 74, 'furniture, shelves', 'start') +
      arrow(212, 66, 188, 76, 'currentColor', 1.2),
      320, 164),
  },
];

/** The result of each test, shown next to the measured results in Observe. */
const RESULTS: Figure[] = [
  // 1. A table that makes earthquakes
  {
    alt: 'A hydraulic actuator pushes a steel table back and forth. The building is bolted to the table. Its base moves with the table and its roof lags behind.',
    caption: 'The actuator\'s chrome rod drives the table. The base of the building moves with the table, and the roof lags behind.',
    svg: svg('A hydraulic actuator pushes a steel table back and forth. The building is bolted to the table. Its base moves with the table and its roof lags behind.',
      // reaction wall and floor
      `<rect x="14" y="70" width="18" height="78" fill="currentColor" fill-opacity=".18" stroke="currentColor"/>` +
      `<line x1="10" y1="148" x2="310" y2="148" stroke="currentColor" stroke-width="1.5"/>` +
      // actuator body and chrome rod
      `<rect x="32" y="118" width="46" height="16" rx="3" fill="${C.steel}" fill-opacity=".5" stroke="currentColor"/>` +
      `<line x1="78" y1="126" x2="104" y2="126" stroke="${C.steel}" stroke-width="5"/>` +
      // steel table
      `<rect x="104" y="116" width="150" height="20" rx="2" fill="${C.amber}" fill-opacity=".35" stroke="${C.amber}" stroke-width="2"/>` +
      shakeArrow(179, 144, 30) +
      // building, base fixed to table, roof displaced to the left (lagging)
      frame(132, 116, 94, 28, [0, -3, -6, -8]) +
      label(36, 96, 'hydraulic', 'start') + label(36, 110, 'actuator', 'start') +
      label(91, 162, 'chrome rod', 'middle') +
      label(262, 131, 'steel table', 'start') +
      label(244, 56, 'roof lags', 'start') + label(244, 70, 'behind', 'start') +
      arrow(242, 58, 222, 38, 'currentColor', 1.2) +
      label(244, 100, 'base moves', 'start') + label(244, 114, 'with the table', 'start', 'dy="-1"') +
      arrow(242, 102, 230, 112, 'currentColor', 1.2),
      340),
  },
  // 2. Find the building's beat
  {
    alt: 'A graph of roof swing against shaking frequency from 0.6 to 4 hertz. The curve peaks sharply at the natural beat of about 1.2 hertz.',
    caption: 'As the sweep speeds up, the roof swing rises to a peak where the shaking matches the natural beat. That peak is resonance.',
    svg: svg('A graph of roof swing against shaking frequency from 0.6 to 4 hertz. The curve peaks sharply at the natural beat of about 1.2 hertz.',
      freqAxes(40, 140, 250, 110, 4.4, [1, 2, 3, 4]) +
      `<rect x="${40 + (0.6 / 4.4) * 250}" y="26" width="${(3.4 / 4.4) * 250}" height="114" fill="${C.amber}" fill-opacity=".08" stroke="none"/>` +
      label(40 + (2.3 / 4.4) * 250, 22, 'the sweep, 0.6 to 4 Hz', 'middle') +
      responseCurve(1.2, 40, 140, 250, 104, 4.4, C.cyan) +
      `<line x1="${40 + (1.2 / 4.4) * 250}" y1="36" x2="${40 + (1.2 / 4.4) * 250}" y2="140" stroke="${C.red}" stroke-dasharray="4 3"/>` +
      label(118, 52, 'resonance', 'start', 'font-weight="700"') +
      label(118, 66, 'natural beat 1.2 Hz', 'start') +
      label(200, 108, 'far from the beat:', 'middle') + label(200, 122, 'small swing', 'middle')),
  },
  // 3. Same strength, different beat
  {
    alt: 'Two tests with the same strength of shaking. At 3 hertz the building barely bends. At 1.2 hertz, in time with its natural beat, it sways hard.',
    caption: 'Both tables shake with the same strength. Only the frequency differs, and only the one in time with the natural beat makes the building sway hard.',
    svg: svg('Two tests with the same strength of shaking. At 3 hertz the building barely bends. At 1.2 hertz, in time with its natural beat, it sways hard.',
      `<line x1="160" y1="10" x2="160" y2="160" stroke="currentColor" stroke-opacity=".3"/>` +
      // left: 3 Hz
      label(80, 18, '3 Hz', 'middle', 'font-weight="700"') + label(80, 32, 'far from the beat', 'middle') +
      frame(52, 112, 56, 24, [0, 1, 2, 3], C.green) +
      `<rect x="40" y="112" width="80" height="8" fill="${C.amber}" fill-opacity=".35" stroke="${C.amber}"/>` +
      wave(30, 138, 100, 9, 6) +
      label(80, 162, 'barely bends', 'middle') +
      // right: 1.2 Hz
      label(240, 18, '1.2 Hz', 'middle', 'font-weight="700"') + label(240, 32, 'in time with the beat', 'middle') +
      frame(212, 112, 56, 24, [0, 10, 18, 24], C.red) +
      `<rect x="200" y="112" width="80" height="8" fill="${C.amber}" fill-opacity=".35" stroke="${C.amber}"/>` +
      wave(190, 138, 100, 9, 2.4) +
      label(240, 162, 'sways hard', 'middle') +
      // the same strength marker on both waves
      `<line x1="134" y1="129" x2="134" y2="147" stroke="currentColor"/>` + `<line x1="294" y1="129" x2="294" y2="147" stroke="currentColor"/>` +
      label(160, 142, 'same', 'middle', 'font-size="11"') + label(160, 154, 'strength', 'middle', 'font-size="11"')),
  },
  // 4. Brace it
  {
    alt: 'Two response curves. The bare frame peaks near 1.2 hertz. The braced frame, about six times stiffer, peaks near 2.9 hertz, further up the frequency scale.',
    caption: 'X-braces make each story stiffer, so the natural beat and its danger zone move up the frequency scale, from about 1.2 Hz to about 2.9 Hz.',
    svg: svg('Two response curves. The bare frame peaks near 1.2 hertz. The braced frame, about six times stiffer, peaks near 2.9 hertz, further up the frequency scale.',
      freqAxes(40, 140, 250, 110, 4.4, [1, 2, 3, 4]) +
      responseCurve(1.2, 40, 140, 250, 104, 4.4, C.cyan) +
      responseCurve(2.9, 40, 140, 250, 104, 4.4, C.amber, 0.08, 0.8) +
      label(40 + (1.2 / 4.4) * 250 + 6, 40, 'bare frame', 'start') +
      label(40 + (1.2 / 4.4) * 250 + 6, 54, '1.2 Hz', 'start') +
      label(40 + (2.9 / 4.4) * 250 + 8, 60, 'X-braced frame', 'start') +
      label(40 + (2.9 / 4.4) * 250 + 8, 74, '2.9 Hz', 'start') +
      arrow(122, 96, 186, 96, 'currentColor', 1.5) +
      label(154, 90, 'stiffer', 'middle')),
  },
  // 5. Float it
  {
    alt: 'A building on rubber bearings. The ground moves a long way. The bearings bend sideways and the floors above move only a little.',
    caption: 'The soft rubber bearings bend side to side, so the ground moves under the building while the floors above move slowly and gently.',
    svg: svg('A building on rubber bearings. The ground moves a long way. The bearings bend sideways and the floors above move only a little.',
      `<rect x="70" y="136" width="170" height="12" fill="${C.amber}" fill-opacity=".35" stroke="${C.amber}" stroke-width="2"/>` +
      arrow(155, 160, 215, 160, C.amber, 3) + arrow(155, 160, 95, 160, C.amber, 3) +
      label(155, 178, 'ground moves a lot', 'middle') +
      // bearings, sheared because the ground has moved right of the building
      [[100], [155], [210]].map(([bx]) => `<path d="M ${bx! - 8} 136 L ${bx! + 8} 136 L ${bx! - 4} 118 L ${bx! - 20} 118 Z" fill="${C.steel}" fill-opacity=".6" stroke="currentColor"/>`).join('') +
      label(14, 124, 'rubber', 'start') + label(14, 138, 'bearings', 'start') +
      arrow(64, 128, 82, 128, 'currentColor', 1.2) +
      frame(86, 118, 116, 28, [0, 1, 2, 3]) +
      arrow(155, 22, 167, 22, C.cyan, 2) + arrow(155, 22, 143, 22, C.cyan, 2) +
      label(212, 26, 'floors move', 'start') + label(212, 40, 'gently', 'start'),
      320, 186),
  },
  // 6. What falls first
  {
    alt: 'A timeline of a strong quake on the bare frame. The first story fails at about 6 seconds, the furniture tumbles right after, and the unreinforced block wall falls about 2 seconds later.',
    caption: 'Structure in blue, nonstructural parts in amber. In this model the first story fails first, then the furniture tumbles, then the block wall comes down.',
    svg: svg('A timeline of a strong quake on the bare frame. The first story fails at about 6 seconds, the furniture tumbles right after, and the unreinforced block wall falls about 2 seconds later.',
      // small scene: frame (structure) with a shelf inside, block wall beside it
      frame(30, 92, 70, 24, [0, 0, 0, 0], C.cyan) +
      `<rect x="44" y="74" width="14" height="18" fill="${C.amber}" fill-opacity=".45" stroke="${C.amber}"/>` +
      [0, 1, 2, 3, 4].map((r) => [0, 1].map((c) => `<rect x="${126 + c * 16 + (r % 2) * 8}" y="${80 - r * 10}" width="16" height="10" fill="${C.amber}" fill-opacity=".25" stroke="${C.amber}"/>`).join('')).join('') +
      label(65, 112, 'structure', 'middle') +
      label(152, 112, 'block wall', 'middle') +
      label(200, 46, 'nonstructural', 'start') + label(200, 60, 'parts: wall,', 'start') + label(200, 74, 'furniture, shelves', 'start') +
      arrow(198, 54, 168, 54, 'currentColor', 1.2) +
      // timeline 0 to 10 s
      arrow(20, 140, 304, 140) +
      [0, 2, 4, 6, 8, 10].map((t) => `<line x1="${24 + t * 26}" y1="137" x2="${24 + t * 26}" y2="143" stroke="currentColor"/>` + label(24 + t * 26, 156, `${t} s`, 'middle', 'font-size="11"')).join('') +
      `<circle cx="${24 + 6 * 26}" cy="140" r="5" fill="${C.red}" stroke="none"/>` +
      `<circle cx="${24 + 6.5 * 26}" cy="140" r="4" fill="${C.amber}" stroke="none"/>` +
      `<circle cx="${24 + 8 * 26}" cy="140" r="5" fill="${C.amber}" stroke="none"/>` +
      label(24 + 6 * 26, 128, '1. first story', 'end', 'font-size="11"') +
      label(24 + 6.5 * 26 + 4, 128, '2. furniture', 'start', 'font-size="11"') +
      label(24 + 8 * 26, 170, '3. block wall', 'middle', 'font-size="11" dy="-1"'),
      320, 172),
  },
];

/** For each guided test, the setup figure (Predict) and the result figure (Observe). */
export const STOP_FIGURES: { setup: Figure; result: Figure }[] = SETUPS.map((setup, i) => ({ setup, result: RESULTS[i]! }));
