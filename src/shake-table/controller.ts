/**
 * Actions the UI and lessons can take, and the per-frame loop. Ported from the prototype's
 * control handlers, uiTick, guided tests and main loop.
 */
import { Synth } from '../core/audio/synth.ts';
import type { BuildingType } from './constants.ts';
import { guessTier, lowerTier, saveChoice, TIERS, type TierChoice } from '../core/render/quality.ts';
import { CHART_SECONDS, type Lab } from './lab.ts';
import { downloadReport, emptyNotebook, saveNotebook, type Notebook, type RunResult } from './notebook.ts';
import type { ShakeMode } from './motion/table.ts';
import type { CameraMode, LabView } from './scene/view.ts';
import { STOPS } from './tour.ts';
import { toast, ui, type DialogName, type StoryStatus } from './ui/store.ts';

const MODE_NAMES = { steady: 'Steady', sweep: 'Sweep', quake: 'Quake' } as const;

export class Controller {
  readonly synth = new Synth();
  private last = performance.now();
  private uiT = 0;
  private peakAcc = 0;
  private lastDraw = 0;
  /** Auto quality: frame times sampled for a few seconds after loading. */
  private fps = { from: 0, frames: 0, done: true };
  private pendingStart: ReturnType<typeof setTimeout> | undefined;
  /** The run in progress: which guided test it belongs to, and what it has measured so far. */
  private run: { stop: number | null; natBeat: number; peakTableG: number; failT: number | null; ended: number | null } | null = null;
  private bannerTimer: ReturnType<typeof setTimeout> | undefined;
  chartCanvas: HTMLCanvasElement | null = null;

  constructor(readonly lab: Lab, readonly view: LabView) {
    lab.onEvent((e, replaying) => {
      view.onEvent(e);
      const slow = ui.slow.value || replaying;
      if (e.kind === 'impact') this.synth.impact(e.p, e.heavy, slow);
      else if (e.kind === 'crack') this.synth.crack(0.6);
      else {
        this.synth.crack(1);
        this.synth.impact(1, true, slow);
        if (!replaying) this.onFailure(e.story, e.t);
      }
    });
    view.stress = ui.stress.value;
    view.drama = ui.drama.value;
    addEventListener('keydown', (e) => this.onKey(e));
  }

  // ---------------------------------------------------------------- controls

  setType(t: BuildingType): void {
    ui.type.value = t;
    clearTimeout(this.pendingStart);
    this.lab.setType(t);
    this.lab.sim.drive.mode = ui.mode.value;
    this.syncDrive();
    ui.replayOn.value = false;
    ui.peakNote.value = '';
    ui.shaking.value = false;
    this.renderStories();
  }

  setMode(m: ShakeMode): void {
    ui.mode.value = m;
    this.lab.setMode(m);
    ui.shaking.value = this.lab.sim.drive.on;
  }

  setF(f: number): void {
    ui.f.value = f;
    this.lab.sim.drive.f = f;
  }

  setG(g: number): void {
    ui.g.value = g;
    this.lab.sim.drive.g = g;
  }

  private syncDrive(): void {
    const d = this.lab.sim.drive;
    d.f = ui.f.value;
    d.g = ui.g.value;
  }

  start(): void {
    this.synth.init();
    if (this.lab.replay.on) this.exitReplay();
    this.syncDrive();
    this.lab.start();
    ui.peakNote.value = '';
    ui.shaking.value = true;
    ui.banner.value = null;
    const stop = ui.stop.value;
    this.run = { stop, natBeat: this.lab.sim.natBeat(), peakTableG: 0, failT: null, ended: null };
    if (stop !== null && ui.poeStage.value < 1) ui.poeStage.value = 1;
  }

  stop(): void {
    this.lab.stop();
    ui.shaking.value = false;
  }

  toggleShake(): void {
    if (this.lab.sim.drive.on) this.stop(); else this.start();
  }

  setSlow(on: boolean): void {
    ui.slow.value = on;
    this.lab.setSlowMotion(on);
  }

  setStress(on: boolean): void {
    ui.stress.value = on;
    this.view.stress = on;
    this.view.dirty = true;
  }

  setSound(on: boolean): void {
    ui.sound.value = on;
    this.synth.init();
    this.synth.setEnabled(on);
  }

  setCamera(mode: CameraMode): void {
    ui.cam.value = mode;
    this.view.setCamera(mode);
  }

  async setHall(key: string): Promise<void> {
    ui.hall.value = key;
    toast('Changing the lighting...', 8000);
    try {
      await this.view.loadHall(key);
      toast('Hall ready', 1200);
    } catch {
      toast('Could not load that lighting. Using plain light.');
    }
  }

  enterReplay(): void {
    if (!this.lab.enterReplay()) {
      toast('Shake something first. The last 15 seconds are always recorded.');
      return;
    }
    this.view.clearDust();
    ui.replayOn.value = true;
    ui.replayPlaying.value = true;
    toast(`Replay of the last ${Math.round(this.lab.recorder.t1 - this.lab.recorder.t0)} seconds`);
  }

  exitReplay(): void {
    this.lab.exitReplay();
    ui.replayOn.value = false;
    if (ui.banner.value?.title === 'INSTANT REPLAY') ui.banner.value = null;
  }

  toggleReplay(): void {
    if (this.lab.replay.on) this.exitReplay(); else this.enterReplay();
  }

  setReplayPlaying(on: boolean): void {
    this.lab.replay.playing = on;
    ui.replayPlaying.value = on;
  }

  setReplaySpeed(s: number): void {
    this.lab.replay.speed = s;
    ui.replaySpeed.value = s;
  }

  seekReplay(fraction: number): void {
    this.lab.seekReplay(fraction);
    ui.replayPlaying.value = false;
  }

  // ---------------------------------------------------------------- guided tests

  showStop(i: number): void {
    const n = Math.max(0, Math.min(STOPS.length - 1, i));
    if (ui.stop.value !== n) {
      const t = ui.notebook.value.tests[n]!;
      ui.poeStage.value = t.prediction === null ? 0 : t.result === null ? 1 : t.explanation ? 3 : 2;
    }
    ui.stop.value = n;
    history.replaceState(null, '', `#stop=${n + 1}`);
  }

  /** Sets up the open test and starts it once the new world is built (prototype `runStop`). */
  runStop(): void {
    const c = STOPS[ui.stop.value ?? 0]!.cfg;
    this.setMode(c.mode);
    if (c.f !== undefined) this.setF(c.f);
    this.setG(c.g);
    this.setStress(c.stress);
    this.setType(c.type);
    this.setCamera(c.cam);
    // The prototype waited 700 ms of real time. Wait 0.7 s of simulated time instead, so the
    // furniture settles the same amount on every device.
    const t0 = this.lab.sim.simT;
    const wait = (): void => {
      if (this.lab.sim.simT - t0 >= 0.7) this.start();
      else this.pendingStart = setTimeout(wait, 50);
    };
    this.pendingStart = setTimeout(wait, 50);
  }

  /** Quality choice from Help: a fixed tier, or auto (guess, then step down if frames are slow). */
  async setQuality(choice: TierChoice): Promise<void> {
    ui.quality.value = choice;
    saveChoice(choice);
    const tier = choice === 'auto' ? guessTier() : choice;
    ui.tier.value = tier;
    await this.view.applyTier(tier);
    if (choice === 'auto') this.startFrameWatch();
  }

  startFrameWatch(): void {
    this.fps = { from: performance.now() + 1500, frames: 0, done: false }; // skip the first frames after a change
  }

  private watchFrameRate(now: number): void {
    const f = this.fps;
    if (f.done || now < f.from) return;
    f.frames++;
    const span = now - f.from;
    if (span < 4000) return;
    f.done = true;
    const avgMs = span / f.frames;
    const lower = lowerTier(ui.tier.value);
    if (avgMs > 40 && lower && ui.quality.value === 'auto') {
      ui.tier.value = lower;
      void this.view.applyTier(lower).then(() => this.startFrameWatch());
      toast(`Switched to ${TIERS[lower].label} quality for smoother motion`, 3000);
    }
  }

  setDrama(on: boolean): void {
    ui.drama.value = on;
    this.view.drama = on;
  }

  // ---------------------------------------------------------------- navigation

  openDialog(name: DialogName | null): void {
    ui.dialog.value = name;
  }

  /** Free mode: closes the guided test panel. */
  explore(): void {
    ui.stop.value = null;
    history.replaceState(null, '', location.pathname + location.search);
  }

  toggleFullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  }

  orbit(angle: number): void {
    ui.cam.value = 'orbit';
    this.view.orbitBy(angle);
  }

  zoom(factor: number): void {
    ui.cam.value = 'orbit';
    this.view.zoomBy(factor);
  }

  resetView(): void {
    ui.cam.value = 'orbit';
    this.view.resetView();
  }

  private onKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (ui.dialog.value && e.key !== '?') return;
    const k = e.key;
    const act: Record<string, () => void> = {
      ' ': () => this.toggleShake(),
      r: () => this.setType(ui.type.value),
      '1': () => this.setType('bare'),
      '2': () => this.setType('braced'),
      '3': () => this.setType('isolated'),
      ArrowLeft: () => this.orbit(0.12),
      ArrowRight: () => this.orbit(-0.12),
      ArrowUp: () => this.zoom(0.9),
      ArrowDown: () => this.zoom(1.1),
      '+': () => this.zoom(0.9),
      '=': () => this.zoom(0.9),
      '-': () => this.zoom(1.1),
      '0': () => this.resetView(),
      c: () => this.setCamera(ui.cam.value === 'orbit' ? 'side' : ui.cam.value === 'side' ? 'ride' : 'orbit'),
      s: () => this.setStress(!ui.stress.value),
      m: () => this.setSlow(!ui.slow.value),
      p: () => this.toggleReplay(),
      n: () => this.openDialog('notebook'),
      g: () => this.showStop(ui.stop.value ?? 0),
      f: () => this.toggleFullscreen(),
      '?': () => this.openDialog(ui.dialog.value === 'help' ? null : 'help'),
      h: () => this.openDialog('help'),
    };
    const fn = act[k.length === 1 ? k.toLowerCase() : k];
    if (!fn) return;
    e.preventDefault();
    fn();
  }

  // ---------------------------------------------------------------- notebook

  private updateNotebook(fn: (n: Notebook) => void): void {
    const n = structuredClone(ui.notebook.value);
    fn(n);
    ui.notebook.value = n;
    saveNotebook(n);
  }

  setPrediction(stop: number, choice: number): void {
    this.updateNotebook((n) => { n.tests[stop]!.prediction = choice; });
  }

  setExplanation(stop: number, text: string): void {
    this.updateNotebook((n) => { n.tests[stop]!.explanation = text; });
  }

  setStudent(name: string): void {
    this.updateNotebook((n) => { n.student = name; });
  }

  clearNotebook(): void {
    ui.notebook.value = emptyNotebook();
    saveNotebook(ui.notebook.value);
  }

  downloadReport(): void {
    downloadReport(ui.notebook.value);
  }

  setPoeStage(stage: number): void {
    ui.poeStage.value = Math.max(0, Math.min(3, stage));
  }

  // ---------------------------------------------------------------- drama

  private onFailure(story: string, t: number): void {
    if (this.run && this.run.failT === null) this.run.failT = t;
    if (!ui.drama.value) return;
    ui.banner.value = { title: 'COLLAPSE', detail: `${story} gave way` };
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => { if (ui.banner.value?.title === 'COLLAPSE') ui.banner.value = null; }, 3500);
  }

  /** Watches the run in progress and files its result when the table has stopped. */
  private trackRun(): void {
    const run = this.run;
    if (!run || this.lab.replay.on) return;
    const sim = this.lab.sim, d = sim.drive;
    run.peakTableG = Math.max(run.peakTableG, d.accG);
    if (!(d.done && d.env <= 0)) return;
    run.ended ??= sim.simT;
    if (sim.simT - run.ended < 1.5) return; // let falling things land
    this.run = null;
    const r: RunResult = {
      at: new Date().toISOString(),
      building: sim.specimen.spec.name,
      shaking: MODE_NAMES[d.mode],
      strength: d.g,
      frequency: d.mode === 'steady' ? d.f : null,
      peakRoofCm: sim.peakRoof * 100,
      peakRoofHz: d.mode === 'sweep' ? sim.peakF : d.mode === 'steady' ? d.f : null,
      peakTableG: run.peakTableG,
      naturalBeatHz: run.natBeat,
      failure: sim.failNote,
      wallBlocksDown: sim.wallBlocksDown(),
    };
    if (run.stop !== null) {
      this.updateNotebook((n) => { n.tests[run.stop!]!.result = r; });
      if (ui.stop.value === run.stop) ui.poeStage.value = Math.max(ui.poeStage.value, 2);
    } else {
      this.updateNotebook((n) => { n.explore.push(r); n.explore = n.explore.slice(-20); });
    }
    toast('Results saved to your notebook', 2500);
    if (run.failT !== null && ui.drama.value) this.instantReplay(run.failT);
  }

  /** Slow-motion replay from just before a collapse. */
  instantReplay(failT: number): void {
    if (!this.lab.enterReplay()) return;
    this.view.clearDust();
    this.lab.seekReplayTime(failT - 2);
    this.setReplaySpeed(0.25);
    ui.replayOn.value = true;
    ui.replayPlaying.value = true;
    ui.banner.value = { title: 'INSTANT REPLAY', detail: 'The collapse at a quarter speed. Press Live to go back.' };
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => { if (ui.banner.value?.title === 'INSTANT REPLAY') ui.banner.value = null; }, 4000);
  }

  // ---------------------------------------------------------------- loop

  frame(now: number): void {
    const dtReal = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const lab = this.lab, view = this.view;
    lab.frame(dtReal);
    view.sync(lab);
    view.updateDust(dtReal * (lab.replay.on ? lab.replay.speed : lab.host.timeScale));
    const d = lab.sim.drive;
    this.synth.tick(d.accG, d.on || d.env > 0.01, !lab.replay.on);
    view.updateCamera(lab);
    view.updateBeacon(!lab.replay.on && (d.on || d.env > 0.01), lab.sim.simT);
    this.trackRun();
    if (now - this.uiT > 100) { this.uiT = now; this.uiTick(); }
    // Redraw only when something can have changed. A still scene is redrawn twice a second,
    // which saves battery and keeps headless browsers delivering frames.
    const live = d.on || d.env > 0;
    const draw = view.dirty || lab.moved || lab.replay.on || live || view.dustActive || view.shaking || view.camMode === 'ride' || now - this.lastDraw > 500;
    if (draw) this.lastDraw = now;
    view.finishFrame(draw);
    this.watchFrameRate(now);
  }

  private uiTick(): void {
    const lab = this.lab, sim = lab.sim, d = sim.drive;
    ui.camTag.value = this.camTag();
    ui.behind.value = lab.host.behind;
    if (lab.replay.on) {
      ui.replayPos.value = lab.replayFraction;
      return;
    }
    this.peakAcc = Math.max(d.accG, this.peakAcc * 0.85);
    ui.tableF.value = ui.mode.value === 'quake' ? (d.on ? 'mixed' : '0.00 Hz') : `${d.on || d.env > 0.01 ? d.fNow.toFixed(2) : '0.00'} Hz`;
    ui.tableA.value = `${this.peakAcc.toFixed(2)} g`;
    const failed = sim.anyFailed;
    ui.roof.value = failed ? 'collapsed' : `${Math.abs(sim.roofSwing() * 100).toFixed(0)} cm`;
    const beat = sim.natBeat();
    ui.natBeat.value = beat > 0 ? `${beat.toFixed(2)} Hz` : 'collapsed';
    this.renderStories();
    if (sim.failNote) ui.peakNote.value = sim.failNote;
    else if (sim.peakRoof > 0.02) {
      ui.peakNote.value = ui.mode.value === 'sweep'
        ? `Biggest roof swing: ${(sim.peakRoof * 100).toFixed(0)} cm at ${sim.peakF.toFixed(2)} Hz`
        : `Biggest roof swing: ${(sim.peakRoof * 100).toFixed(0)} cm`;
    }
    ui.shaking.value = d.on;
    ui.tableLive.value = d.on || d.env > 0.01;
    this.drawChart();
  }

  private renderStories(): void {
    ui.stories.value = [...this.lab.sim.springs].reverse().map((s): StoryStatus => ({
      label: s.label,
      status: s.failed ? 'fail' : s.damage > 0.01 ? 'crack' : 'ok',
      detail: s.iso ? `${(s.d * 100).toFixed(0)} cm` : s.failed ? '' : `${(s.r * 100).toFixed(1)}% drift`,
    }));
  }

  private camTag(): string {
    if (ui.cam.value === 'orbit') return '';
    const tc = Math.max(0, this.lab.replay.on ? this.lab.replay.t : this.lab.sim.simT);
    const mm = Math.floor(tc / 60), ss = Math.floor(tc % 60), cs = Math.floor((tc * 100) % 100);
    const time = this.lab.replay.on ? 'REPLAY' : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
    return `${ui.cam.value === 'side' ? 'CAM 2   HIGH SPEED   240 FPS' : 'CAM 3   FLOOR 2   INTERIOR'}   ${time}`;
  }

  /** Table acceleration and roof swing over the last 12 s (prototype `drawChart`). */
  private drawChart(): void {
    const chart = this.chartCanvas;
    if (!chart) return;
    const r = chart.getBoundingClientRect(), dpr = devicePixelRatio;
    if (chart.width !== Math.round(r.width * dpr)) { chart.width = Math.round(r.width * dpr); chart.height = Math.round(r.height * dpr); }
    const cx = chart.getContext('2d')!, W = chart.width, H = chart.height;
    cx.clearRect(0, 0, W, H);
    cx.strokeStyle = 'rgba(255,255,255,.1)';
    cx.lineWidth = 1;
    for (let i = 1; i < 4; i++) { cx.beginPath(); cx.moveTo(0, (H * i) / 4); cx.lineTo(W, (H * i) / 4); cx.stroke(); }
    cx.fillStyle = 'rgba(255,255,255,.45)';
    cx.font = `${11 * dpr}px "JetBrains Mono", monospace`;
    cx.fillText('+0.6 g', 4 * dpr, 12 * dpr);
    cx.fillText('+80 cm', W - 50 * dpr, 12 * dpr);
    const data = this.lab.chart;
    if (data.length < 2) return;
    const tEnd = data[data.length - 1]![0];
    const line = (idx: 1 | 2, scale: number, col: string): void => {
      cx.strokeStyle = col;
      cx.lineWidth = 2 * dpr;
      cx.beginPath();
      let pen = false;
      for (const p of data) {
        if (Number.isNaN(p[idx])) { pen = false; continue; }
        const X = W * (1 - (tEnd - p[0]) / CHART_SECONDS);
        const v = Math.max(-1, Math.min(1, p[idx] / scale));
        const Y = H / 2 - v * (H / 2 - 2);
        if (pen) cx.lineTo(X, Y); else cx.moveTo(X, Y);
        pen = true;
      }
      cx.stroke();
    };
    line(1, 0.6, '#ffb020');
    line(2, 80, '#4cc9f0');
  }
}
