/**
 * One small diagram for each engineering hint in the design challenge, in the same order as
 * HINTS in ui/design.tsx. Each picture labels its parts with the words the hint uses, so the
 * student gets every hint twice: once in words and once as a picture (dual coding).
 */
import { arrow, C, label, shakeArrow, svg, type Figure } from './figure.ts';

const INK = 'currentColor';

function line(x1: number, y1: number, x2: number, y2: number, color: string = INK, w = 2, extra = ''): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}" ${extra}/>`;
}

/** A thin leader line from a label to the part it names. */
function leader(x1: number, y1: number, x2: number, y2: number): string {
  return line(x1, y1, x2, y2, INK, 1, 'stroke-opacity="0.6"');
}

/** A dimension line with arrowheads at both ends. */
function dim(x1: number, y1: number, x2: number, y2: number, color: string = INK): string {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  return arrow(mx, my, x1, y1, color, 1.2) + arrow(mx, my, x2, y2, color, 1.2);
}

/** The ground: a line with short hatch marks below it. */
function ground(x1: number, x2: number, y: number): string {
  let h = line(x1, y, x2, y, INK, 2);
  for (let x = x1 + 4; x <= x2; x += 10) h += line(x, y + 1, x - 6, y + 7, INK, 1, 'stroke-opacity="0.5"');
  return h;
}

interface FrameOpts {
  /** Column color per story, or one color for all. */
  col?: string | string[];
  /** Column stroke width per story, or one width for all. */
  colW?: number | number[];
  /** Which stories have X braces. */
  brace?: boolean[];
}

/**
 * A building as a stack of story frames, seen from the side. Story i runs from level i to
 * level i + 1 (level 0 is the base, at y = base). off[i] is how far level i has moved sideways,
 * so a leaning building has growing offsets.
 */
function frame(x: number, base: number, w: number, hs: number[], off: number[], o: FrameOpts = {}): string {
  const ys = [base];
  for (const h of hs) ys.push(ys.at(-1)! - h);
  const pick = <T,>(v: T | T[] | undefined, i: number, d: T): T => (Array.isArray(v) ? (v[i] ?? d) : (v ?? d));
  let s = '';
  hs.forEach((_, i) => {
    const y0 = ys[i]!, y1 = ys[i + 1]!, a = off[i] ?? 0, b = off[i + 1] ?? 0;
    if (o.brace?.[i]) {
      s += line(x + a, y0, x + w + b, y1, C.steel, 1.5) + line(x + w + a, y0, x + b, y1, C.steel, 1.5);
    }
    const c = pick(o.col, i, INK), cw = pick(o.colW, i, 2);
    s += line(x + a, y0, x + b, y1, c, cw) + line(x + w + a, y0, x + w + b, y1, c, cw);
  });
  for (let i = 1; i < ys.length; i++) {
    const a = off[i] ?? 0;
    s += line(x + a - 3, ys[i]!, x + w + a + 3, ys[i]!, INK, 3.5);
  }
  return s;
}

/** A sway trace over time: a sine wave that can die out. */
function wave(x0: number, x1: number, yc: number, amp: number, cycles: number, decay: number, color: string): string {
  const pts: string[] = [];
  const n = 120;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(`${(x0 + (x1 - x0) * t).toFixed(1)},${(yc - amp * Math.exp(-decay * t) * Math.sin(2 * Math.PI * cycles * t)).toFixed(1)}`);
  }
  return line(x0, yc, x1, yc, INK, 1, 'stroke-opacity="0.35"') +
    `<polyline points="${pts.join(' ')}" stroke="${color}" stroke-width="2"/>`;
}

/** A horizontal coil spring between two x positions. */
function spring(x1: number, x2: number, y: number, color: string = C.steel): string {
  const n = 6, step = (x2 - x1 - 6) / n;
  let d = `M${x1},${y} h3`;
  for (let i = 0; i < n; i++) d += ` l${(step / 2).toFixed(1)},${i % 2 ? 4 : -4} l${(step / 2).toFixed(1)},${i % 2 ? -4 : 4}`;
  d += ' h3';
  return `<path d="${d}" stroke="${color}" stroke-width="1.5"/>`;
}

function fig(alt: string, caption: string, body: string): Figure {
  return { alt, caption, svg: svg(alt, body) };
}

/* 1. Soft story: the weak ground story takes all the bending. */
const softStory = (() => {
  const x = 100, base = 140, w = 70;
  const body =
    ground(60, 220, base) +
    frame(x, base, w, [42, 30, 30], [0, 22, 24, 26], { col: [C.red, INK, INK], brace: [false, true, true] }) +
    // where the building stood before it bent
    `<rect x="${x}" y="${base - 102}" width="${w}" height="102" stroke="${INK}" stroke-opacity="0.35" stroke-width="1" stroke-dasharray="3 3"/>` +
    leader(204, 62, 232, 62) + label(238, 58, 'stiff stories') + label(238, 72, 'above') +
    leader(184, 122, 232, 122) + label(238, 118, 'soft story') + label(238, 132, 'bends most') +
    shakeArrow(135, 156, 26) + label(170, 160, 'shaking');
  return fig(
    'A three-story building whose soft ground story leans over sharply while the braced stories above stay square.',
    'Look at the soft story at the bottom: it takes the bending while the stiffer stories above just ride along.',
    body,
  );
})();

/* 2. Torsion: bracing on one face makes a story twist, and the flexible side moves far more. */
const torsion = (() => {
  const cx = 110, top = 46, s = 84, x0 = cx - s / 2;
  const body =
    label(12, 22, 'one story, seen from above') +
    // the story's floor outline before shaking
    `<rect x="${x0}" y="${top}" width="${s}" height="${s}" stroke="${INK}" stroke-width="1.5"/>` +
    // the twisted outline: it turns about the braced face
    `<rect x="${x0}" y="${top}" width="${s}" height="${s}" stroke="${C.cyan}" stroke-width="2" stroke-dasharray="5 3" transform="rotate(-13 ${cx} ${top})"/>` +
    // the braced face
    line(x0, top, x0 + s, top, C.steel, 6) +
    arrow(cx - 6, top + s + 12, cx + 26, top + s + 5, C.red, 2.5) +
    `<path d="M${cx + 20},${top + 56} A22,22 0 1,0 ${cx - 20},${top + 56}" stroke="${C.cyan}" stroke-width="1.5"/>` +
    arrow(cx - 22, top + 50, cx - 20, top + 56, C.cyan, 1.5) + label(cx, top + 50, 'twists', 'middle') +
    leader(x0 + s + 4, top, 206, top) + label(212, top + 4, 'braced face') + label(212, top + 18, 'barely moves') +
    leader(182, top + s - 6, 206, top + s - 6) + label(212, top + s - 10, 'flexible side') + label(212, top + s + 4, 'moves far more') +
    shakeArrow(cx, 156, 26) + label(cx + 34, 160, 'shaking');
  return fig(
    'A floor plan of one story braced on one face only: under sideways shaking it twists about the braced face, so the flexible side swings far.',
    'The braced face barely moves, but the flexible side swings far: the story twists.',
    body,
  );
})();

/* 3. A stiffer frame moves less and has a faster natural beat. */
const stiffBeat = (() => {
  const base = 128, w = 34;
  const body =
    label(80, 22, 'light frame', 'middle') + label(240, 22, 'stiffer frame', 'middle') +
    ground(14, 70, base) + frame(22, base, w, [26, 26, 26], [0, 6, 11, 15]) +
    wave(80, 150, 76, 22, 1.5, 0, C.cyan) +
    label(115, 140, 'moves more', 'middle') + label(115, 155, 'slow beat', 'middle') +
    line(160, 34, 160, 160, INK, 1, 'stroke-opacity="0.25"') +
    ground(174, 230, base) + frame(182, base, w, [26, 26, 26], [0, 2, 3.5, 5], { brace: [true, true, true] }) +
    wave(240, 306, 76, 9, 4, 0, C.cyan) +
    label(273, 140, 'moves less', 'middle') + label(273, 155, 'faster beat', 'middle');
  return fig(
    'Two buildings side by side: a light frame leaning far with a slow sway trace, and a braced, stiffer frame leaning little with a faster sway trace.',
    'Compare the traces: the stiffer frame sways less and back and forth faster, away from the quake\'s slow swings.',
    body,
  );
})();

/* 4. Dampers soak up energy like shock absorbers. */
const dampers = (() => {
  const x = 34, base = 132, w = 74, h = 70;
  const ang = (Math.atan2(-h, w) * 180) / Math.PI, len = Math.hypot(w, h);
  const damper =
    `<g transform="translate(${x} ${base}) rotate(${ang.toFixed(2)})">` +
    line(0, 0, len * 0.3, 0, C.steel, 2) +
    `<rect x="${len * 0.3}" y="-6" width="${len * 0.32}" height="12" rx="2" fill="${C.cyan}" fill-opacity="0.3" stroke="${C.cyan}" stroke-width="2"/>` +
    line(len * 0.55, -4, len * 0.55, 4, C.cyan, 2) +
    line(len * 0.55, 0, len, 0, C.steel, 2) +
    '</g>';
  const body =
    ground(16, 126, base) + damper + frame(x, base, w, [h], [0, 0]) +
    leader(58, 84, 66, 96) + label(40, 80, 'damper') + label(71, 152, 'soaks up energy', 'middle') +
    label(150, 26, 'without dampers') + wave(150, 306, 54, 16, 5, 0.25, C.steel) +
    label(150, 94, 'with dampers') + wave(150, 306, 122, 16, 5, 3.2, C.cyan);
  return fig(
    'A story frame with a diagonal damper, next to two sway traces: without dampers the swaying keeps going, with dampers it dies out quickly.',
    'The damper works like a shock absorber: it soaks up energy so the swaying dies out sooner.',
    body,
  );
})();

/* 5. P-Delta: the weight above pushes a leaning story further over. */
const pDelta = (() => {
  const x = 70, base = 140, w = 56;
  const off = [0, 14, 24, 30];
  const tx = x + off[3]!;
  const body =
    ground(40, 160, base) +
    frame(x, base, w, [30, 30, 30], off, { colW: [4, 3, 2], col: [C.red, INK, INK] }) +
    // where the building stood upright
    line(x, base, x, 38, INK, 1, 'stroke-dasharray="3 3" stroke-opacity="0.6"') +
    dim(x, 44, tx, 44) + label(x + 15, 36, 'lean', 'middle') +
    arrow(tx + 14, 18, tx + 14, 46, C.amber, 2.5) + arrow(tx + 42, 18, tx + 42, 46, C.amber, 2.5) +
    label(tx + 56, 28, 'weight above') +
    `<path d="M166,62 Q182,80 176,104" stroke="${C.red}" stroke-width="2"/>` + arrow(177, 96, 176, 104, C.red, 2) +
    label(196, 72, 'P-Delta effect:') + label(196, 88, 'the weight') + label(196, 104, 'pushes it') + label(196, 120, 'further over') +
    leader(136, 126, 190, 140) + label(196, 144, 'lower stories') + label(196, 158, 'need strength');
  return fig(
    'A three-story building leaning to the right, with the weight above pressing down on the top, off to one side of the base by the lean.',
    'The weight sits off to one side of the base by the lean, so it pushes the building further over: the P-Delta effect.',
    body,
  );
})();

/* 6. Drift is how far a story leans compared with its height, and level 2 has a drift limit. */
const drift = (() => {
  const x = 96, base = 140, top = 50, w = 80, d = 18, lim = 32;
  const body =
    ground(70, 200, base) +
    // the drift limit: the most lean allowed
    line(x + w, base, x + w + lim, top, C.red, 1.5, 'stroke-dasharray="5 3"') +
    frame(x, base, w, [base - top], [0, d], { col: C.cyan }) +
    line(x + w, base, x + w, top - 16, INK, 1, 'stroke-dasharray="3 3" stroke-opacity="0.6"') +
    dim(x + w, top - 12, x + w + d, top - 12) + label(x + w + d / 2, top - 20, 'drift', 'middle') +
    dim(x - 16, base, x - 16, top) + label(x - 22, 92, 'story', 'end') + label(x - 22, 106, 'height', 'end') +
    leader(x + w + lim - 3, top + 12, 222, top + 12) + label(226, top + 16, 'drift limit') +
    label(258, 104, 'drift', 'middle') + line(220, 110, 296, 110, INK, 1.5) + label(258, 125, 'story height', 'middle');
  return fig(
    'One story leaning sideways, with its drift measured across the top, its story height measured up the side, and a dashed drift limit line.',
    'Drift compares how far the story leans with the story height. Past the drift limit, the building is not safe to use.',
    body,
  );
})();

/* 7. A tuned mass damper: a heavy block on the roof swings against the building. */
const tmd = (() => {
  const x = 140, base = 148, w = 60;
  const off = [0, 4, 8, 11, 13];
  const roof = base - 4 * 24, r = off[4]!;
  const bx = x + r + 14; // the block, moved left of the roof's middle
  const body =
    ground(100, 250, base) +
    frame(x, base, w, [24, 24, 24, 24], off) +
    line(x + r, roof, x + r, roof - 18, INK, 2) + line(x + w + r, roof, x + w + r, roof - 18, INK, 2) +
    spring(x + r, bx, roof - 9) + spring(bx + 22, x + w + r, roof - 9) +
    `<rect x="${bx}" y="${roof - 18}" width="22" height="17" rx="2" fill="${C.steel}" fill-opacity="0.6" stroke="${INK}" stroke-width="1.5"/>` +
    arrow(bx + 18, roof - 26, bx - 6, roof - 26, C.amber, 2) +
    arrow(x + w + r + 8, roof + 14, x + w + r + 32, roof + 14, C.cyan, 2) +
    label(x - 2, roof - 18, 'tuned mass damper', 'end') + label(x - 2, roof - 2, 'heavy block swings', 'end') +
    label(x - 2, roof + 14, 'against the building', 'end') + leader(x, roof - 14, bx - 2, roof - 12) +
    label(x + w + r + 8, roof + 34, 'building') + label(x + w + r + 8, roof + 48, 'sways');
  return fig(
    'A four-story building swaying to the right while a heavy block on springs on its roof moves to the left.',
    'The heavy block on the roof swings the opposite way from the building, which calms the swaying.',
    body,
  );
})();

/* 8. Base isolation: the ground moves under the building. */
const isolation = (() => {
  const base = 126, w = 44, hs = [26, 26, 26];
  const slide = 14, rx = 196;
  let pads = '';
  for (const px of [rx - 6, rx + 16, rx + 38]) {
    // a rubber isolator, sheared as the ground slides right under it
    pads += `<path d="M${px + slide},${base + 14} L${px + slide + 14},${base + 14} L${px + 14},${base + 2} L${px},${base + 2} Z" fill="${C.steel}" fill-opacity="0.45" stroke="${C.steel}" stroke-width="1.5"/>`;
  }
  const body =
    label(60, 22, 'fixed base', 'middle') + label(220, 22, 'base isolation', 'middle') +
    ground(14, 108, base) + frame(38, base, w, hs, [0, 7, 13, 17], { col: C.red }) +
    shakeArrow(60, 144, 22) + label(60, 160, 'building bends', 'middle') +
    line(136, 34, 136, 118, INK, 1, 'stroke-opacity="0.25"') +
    line(rx - 10, base, rx + w + 10, base, INK, 3.5) + pads +
    frame(rx, base, w, hs, [0, 0, 0, 0], { col: C.cyan }) +
    ground(rx - 10 + slide, rx + w + 10 + slide, base + 14) +
    arrow(rx + w + 30, base + 14, rx + w + 52, base + 14, C.amber, 2) + label(rx + 22, 160, 'ground moves under it', 'middle') +
    leader(rx - 4, base + 9, 190, base + 9) + label(186, base + 13, 'isolators', 'end') +
    label(rx + w + 10, 72, 'stays') + label(rx + w + 10, 86, 'upright');
  return fig(
    'Two buildings: one on a fixed base bends with the shaking, the other sits on rubber isolators that shear while the ground slides underneath, and it stays upright.',
    'With base isolation the ground moves under the building and the rubber isolators shear, so the building above stays upright.',
    body,
  );
})();

/** One figure per hint in the design challenge, in the same order as HINTS. */
export const HINT_FIGURES: Figure[] = [softStory, torsion, stiffBeat, dampers, pDelta, drift, tmd, isolation];
