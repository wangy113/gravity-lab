/**
 * Actions the UI and lessons can take, and the per-frame loop. Ported from the prototype's
 * control handlers, uiTick, guided tests and main loop.
 */
import { Synth } from '../core/audio/synth.ts';
import type { BuildingType } from './constants.ts';
import { CHART_SECONDS, type Lab } from './lab.ts';
import type { ShakeMode } from './motion/table.ts';
import type { CameraMode, LabView } from './scene/view.ts';
import { STOPS } from './tour.ts';
import { toast, ui, type StoryStatus } from './ui/store.ts';

export class Controller {
  readonly synth = new Synth();
  private last = performance.now();
  private uiT = 0;
  private peakAcc = 0;
  private pendingStart: ReturnType<typeof setTimeout> | undefined;
  chartCanvas: HTMLCanvasElement | null = null;

  constructor(readonly lab: Lab, readonly view: LabView) {
    lab.onEvent((e, replaying) => {
      view.onEvent(e);
      const slow = ui.slow.value || replaying;
      if (e.kind === 'impact') this.synth.impact(e.p, e.heavy, slow);
      else if (e.kind === 'crack') this.synth.crack(0.6);
      else { this.synth.crack(1); this.synth.impact(1, true, slow); }
    });
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
    toast('Loading the hall...', 8000);
    try {
      await this.view.loadHall(key);
      toast('Hall ready', 1200);
    } catch {
      toast('Could not load the hall. Using a plain room.');
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
    if (now - this.uiT > 100) { this.uiT = now; this.uiTick(); }
    view.render();
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
