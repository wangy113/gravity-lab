/**
 * Dual coding (Paivio): every key idea in the lab is given twice, once in words and once
 * as a labeled picture that uses the same words. Students who build both a verbal and a
 * visual memory of an idea recall it better than students who get either one alone.
 *
 * Figures are small, static inline SVG strings so the same picture can appear in the
 * lab panel, the text version and the printed lab report. They draw with currentColor
 * plus a few fixed accents, so they read on the dark panel and on the white report.
 * On-screen text follows the house rules: no em dashes, no semicolons, no middle dots.
 */

export interface Figure {
  /** Short alt text: what the picture shows, read by screen readers. */
  alt: string;
  /** The full caption, for the text version and the printed report, where it has to stand on its own. */
  caption: string;
  /**
   * A short look-here cue, for the lab panel, where the same idea already sits in the text
   * beside the picture. It points to the one part that matters (signaling) instead of
   * repeating the text (redundancy). See the multimedia notes in pedagogy.ts.
   */
  cue: string;
  /** SVG markup made by svg(). Trusted, written by the lab's authors. */
  svg: string;
}

/** Fixed accent colors. They match the lab's palette and keep contrast on dark and white. */
export const C = {
  amber: '#ffb020', // the table, the shaking, things that push
  cyan: '#4cc9f0', // the building's own response
  red: '#ff4d3d', // failure, danger
  green: '#36d47c', // safe
  steel: '#8a99a6', // braces, bearings, neutral parts
} as const;

/** Wraps figure drawing in an accessible SVG element. */
export function svg(alt: string, body: string, w = 320, h = 170): string {
  return `<svg class="figsvg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${alt.replace(/"/g, '&quot;')}" xmlns="http://www.w3.org/2000/svg" font-family="Barlow, system-ui, sans-serif" font-size="12" fill="none" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

/** A text label in the ink color. anchor is start, middle or end. */
export function label(x: number, y: number, text: string, anchor: 'start' | 'middle' | 'end' = 'start', extra = ''): string {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="currentColor" stroke="none" ${extra}>${text}</text>`;
}

/** An arrow from (x1, y1) to (x2, y2). */
export function arrow(x1: number, y1: number, x2: number, y2: number, color: string = 'currentColor', width = 2): string {
  const a = Math.atan2(y2 - y1, x2 - x1), s = 7;
  const p1 = `${x2 - s * Math.cos(a - 0.45)},${y2 - s * Math.sin(a - 0.45)}`;
  const p2 = `${x2 - s * Math.cos(a + 0.45)},${y2 - s * Math.sin(a + 0.45)}`;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}"/><polygon points="${x2},${y2} ${p1} ${p2}" fill="${color}" stroke="none"/>`;
}

/** A double-headed arrow, for back and forth shaking. */
export function shakeArrow(cx: number, y: number, half: number, color: string = C.amber): string {
  return arrow(cx, y, cx + half, y, color) + arrow(cx, y, cx - half, y, color);
}

/**
 * Renders a figure. The panel shows the short cue, because the words it would repeat are
 * right beside it. The text version and the report show the full caption.
 */
export function figureHtml(f: Figure, where: 'panel' | 'page' = 'page'): string {
  return where === 'panel'
    ? `<figure class="fig"><figcaption class="cue">${f.cue}</figcaption>${f.svg}</figure>`
    : `<figure class="fig">${f.svg}<figcaption>${f.caption}</figcaption></figure>`;
}
