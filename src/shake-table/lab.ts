/**
 * The running lab: simulation, fixed-step clock, replay and chart history. The view, audio
 * and UI read from here and change things only through its methods.
 */
import type RAPIER_NS from '@dimforge/rapier3d-deterministic-compat';
import type { SimEvent } from '../core/sim/events.ts';
import { FixedStepHost } from '../core/sim/host.ts';
import { PoseBuffer, readPoses } from '../core/sim/poses.ts';
import { Recorder } from '../core/sim/recorder.ts';
import { DT, type BuildingType } from './constants.ts';
import type { ShakeMode } from './motion/table.ts';
import { ShakeTableSim } from './sim/simulation.ts';

export const REC_SECONDS = 15;
export const CHART_SECONDS = 12;
const SAMPLE_EVERY = 4; // steps: 60 Hz for the chart and replay

/** Per story: drift ratio, damage, failed (0 or 1). */
export const SPRING_FIELDS = 3;

export type EventListener = (e: SimEvent, replaying: boolean) => void;

export class Lab {
  readonly sim: ShakeTableSim;
  readonly host: FixedStepHost;
  /** Poses before and after the last step: the view draws between them. */
  readonly prev = new PoseBuffer();
  readonly curr = new PoseBuffer();
  springState = new Float32Array(0);
  readonly recorder = new Recorder(REC_SECONDS, 60);
  /** Chart history: time, table acceleration (g), roof swing (cm, NaN after a failure). */
  readonly chart: [number, number, number][] = [];
  readonly replay = { on: false, t: 0, speed: 0.25, playing: true };
  private eventLog: SimEvent[] = [];
  private readonly listeners: EventListener[] = [];
  private readonly scratch = new PoseBuffer();
  private scratchSprings = new Float32Array(0);
  private stepCount = 0;
  private replayAlpha = 0;

  constructor(R: typeof RAPIER_NS, type: BuildingType = 'bare') {
    this.sim = new ShakeTableSim(R, { type });
    this.host = new FixedStepHost(this.sim, DT, {
      beforeLastStep: () => readPoses(this.sim, this.prev),
      afterStep: () => this.afterStep(),
    });
    this.afterReset();
  }

  onEvent(fn: EventListener): void {
    this.listeners.push(fn);
  }

  get alpha(): number {
    return this.replay.on ? this.replayAlpha : this.host.alpha;
  }

  // ---------------------------------------------------------------- commands

  setType(type: BuildingType): void {
    this.exitReplay();
    this.sim.reset(type);
    this.afterReset();
  }

  setMode(mode: ShakeMode): void {
    this.sim.setMode(mode);
  }

  start(): void {
    if (this.replay.on) this.exitReplay();
    this.sim.start();
  }

  stop(): void {
    this.sim.stop();
  }

  setSlowMotion(on: boolean): void {
    this.host.timeScale = on ? 0.2 : 1;
  }

  /** Returns false when there is not enough recorded to replay. */
  enterReplay(): boolean {
    if (this.recorder.length < 30) return false;
    Object.assign(this.replay, { on: true, t: this.recorder.t0, playing: true });
    return true;
  }

  exitReplay(): void {
    if (!this.replay.on) return;
    this.replay.on = false;
    readPoses(this.sim, this.prev);
    readPoses(this.sim, this.curr);
    this.readSprings(this.springState);
  }

  seekReplay(fraction: number): void {
    this.replay.t = this.recorder.t0 + fraction * (this.recorder.t1 - this.recorder.t0);
    this.replay.playing = false;
  }

  get replayFraction(): number {
    const span = this.recorder.t1 - this.recorder.t0;
    return span > 0 ? (this.replay.t - this.recorder.t0) / span : 0;
  }

  // ---------------------------------------------------------------- frame

  /** Advances by one rendered frame of real time. */
  frame(realSeconds: number): void {
    if (this.replay.on) return this.replayFrame(realSeconds);
    const n = this.host.advance(realSeconds);
    if (n > 0) {
      readPoses(this.sim, this.curr);
      this.readSprings(this.springState);
    }
    if (this.sim.events.length) {
      for (const e of this.sim.events) {
        this.eventLog.push(e);
        for (const fn of this.listeners) fn(e, false);
      }
      this.sim.events.length = 0;
      const cut = this.sim.simT - REC_SECONDS;
      while (this.eventLog.length && this.eventLog[0]!.t < cut) this.eventLog.shift();
    }
  }

  private replayFrame(realSeconds: number): void {
    const R = this.replay;
    if (R.playing) {
      const prevT = R.t;
      R.t += Math.min(0.05, realSeconds) * R.speed;
      if (R.t > this.recorder.t1) R.t = this.recorder.t0;
      else for (const e of this.eventLog) if (e.t > prevT && e.t <= R.t) for (const fn of this.listeners) fn(e, true);
    }
    const s = this.recorder.sample(R.t);
    if (!s) return;
    this.prev.copyFrom(s.a.poses);
    this.curr.copyFrom(s.b.poses);
    this.replayAlpha = s.alpha;
    // Story state is not interpolated: take the nearer frame.
    const src = s.alpha < 0.5 ? s.a : s.b;
    if (this.springState.length !== src.extraLen) this.springState = new Float32Array(src.extraLen);
    this.springState.set(src.extra.subarray(0, src.extraLen));
  }

  // ---------------------------------------------------------------- internals

  private afterReset(): void {
    this.host.resetClock();
    this.recorder.clear();
    this.chart.length = 0;
    this.eventLog = [];
    this.stepCount = 0;
    readPoses(this.sim, this.prev);
    readPoses(this.sim, this.curr);
    this.springState = new Float32Array(this.sim.springs.length * SPRING_FIELDS);
    this.readSprings(this.springState);
  }

  private readSprings(out: Float32Array): void {
    this.sim.springs.forEach((s, i) => {
      out[i * SPRING_FIELDS] = s.r;
      out[i * SPRING_FIELDS + 1] = s.damage;
      out[i * SPRING_FIELDS + 2] = s.failed ? 1 : 0;
    });
  }

  private afterStep(): void {
    if (++this.stepCount % SAMPLE_EVERY !== 0) return;
    const sim = this.sim;
    readPoses(sim, this.scratch);
    if (this.scratchSprings.length !== sim.springs.length * SPRING_FIELDS) this.scratchSprings = new Float32Array(sim.springs.length * SPRING_FIELDS);
    this.readSprings(this.scratchSprings);
    this.recorder.record(sim.simT, this.scratch, this.scratchSprings);
    this.chart.push([sim.simT, sim.drive.signedAccG(), sim.anyFailed ? NaN : sim.roofSwing() * 100]);
    while (this.chart.length && this.chart[0]![0] < sim.simT - CHART_SECONDS) this.chart.shift();
  }
}
