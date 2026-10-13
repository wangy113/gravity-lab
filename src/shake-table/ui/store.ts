import { signal } from '@preact/signals';
import type { BuildingType } from '../constants.ts';
import type { ShakeMode } from '../motion/table.ts';
import type { CameraMode } from '../scene/view.ts';

export type StoryStatus = { label: string; status: 'ok' | 'crack' | 'fail'; detail: string };

/** UI state. The lab and view are the source of truth for physics; these are the controls and readouts. */
export const ui = {
  type: signal<BuildingType>('bare'),
  mode: signal<ShakeMode>('steady'),
  f: signal(1.2),
  g: signal(0.25),
  cam: signal<CameraMode>('orbit'),
  stress: signal(false),
  slow: signal(false),
  sound: signal(true),
  hall: signal('aircraft'),
  shaking: signal(false),

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

  // overlays
  loading: signal(true),
  loadProgress: signal(0),
  loadMsg: signal('Starting the physics engine'),
  toast: signal(''),
  stop: signal<number | null>(null), // open guided test, or null
  dialog: signal<'intro' | 'text' | 'about' | null>(null),
  credits: signal<{ name: string; type: string; authors: string[] }[]>([]),
};

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string, ms = 2200): void {
  ui.toast.value = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (ui.toast.value = ''), ms);
}
