import { signal } from '@preact/signals';
import type { Tier, TierChoice } from '../../core/render/quality.ts';
import type { BuildingType } from '../constants.ts';
import type { ShakeMode } from '../motion/table.ts';
import { loadNotebook, type Notebook } from '../notebook.ts';
import { startDesign, type Design } from '../specimen/design.ts';
import type { CameraMode } from '../scene/view.ts';

export type DialogName = 'intro' | 'text' | 'about' | 'help' | 'notebook' | 'instructors';
export type StoryStatus = { label: string; status: 'ok' | 'crack' | 'fail'; detail: string };

/** UI state. The lab and view are the source of truth for physics; these are the controls and readouts. */
export const ui = {
  type: signal<BuildingType>('bare'),
  mode: signal<ShakeMode>('steady'),
  f: signal(1.2),
  g: signal(0.25),
  cam: signal<CameraMode>('orbit'),
  stress: signal(true),
  drama: signal(true),
  /** Single-key shortcuts, which can be turned off (WCAG 2.1.4). Remembered in this browser. */
  shortcuts: signal(((): boolean => { try { return localStorage.getItem('shake-table-lab.shortcuts') !== 'off'; } catch { return true; } })()),
  quality: signal<TierChoice>('auto'),
  tier: signal<Tier>('medium'),
  slow: signal(false),
  sound: signal(true),
  hall: signal('aircraft'),
  shaking: signal(false),
  tableLive: signal(false),

  // readouts, refreshed 10 times a second
  tableF: signal('0.00 Hz'),
  tableA: signal('0.00 g'),
  roof: signal('0 cm'),
  natBeat: signal('1.20 Hz'),
  peakNote: signal(''),
  stories: signal<StoryStatus[]>([]),
  camTag: signal(''),
  behind: signal(false),

  // replay
  replayOn: signal(false),
  replayPlaying: signal(true),
  replaySpeed: signal(0.25),
  replayPos: signal(0),
  /** What the instruments read at the replay time, shown under the chart. */
  replayInfo: signal(''),

  // overlays
  loading: signal(true),
  loadProgress: signal(0),
  loadMsg: signal('Starting the physics engine'),
  toast: signal(''),
  /** Read out by screen readers (a polite live region), never shown. */
  announce: signal(''),
  stop: signal<number | null>(null), // open guided test, or null
  design: signal(false), // design challenge open
  draft: signal<Design>(startDesign(1)),
  designPrediction: signal<'survive' | 'collapse' | null>(null),
  poeStage: signal(0), // 0 Predict, 1 Test, 2 Observe, 3 Explain
  dialog: signal<DialogName | null>(null),
  banner: signal<{ title: string; detail: string } | null>(null),
  notebook: signal<Notebook>(loadNotebook()),
  credits: signal<{ name: string; type: string; authors: string[] }[]>([]),
};

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string, ms = 2200): void {
  ui.toast.value = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (ui.toast.value = ''), ms);
}
