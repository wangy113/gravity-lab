export interface Steppable {
  step(): void;
}

/**
 * Runs a simulation in whole fixed steps, however irregular the frames are. Simulated time
 * is the only clock for data: if a device cannot keep up, the simulation runs slower than
 * real time (and `behind` says so) instead of skipping steps.
 */
export class FixedStepHost {
  timeScale = 1;
  behind = false;
  private acc = 0;

  constructor(
    private readonly sim: Steppable,
    readonly dt: number,
    private readonly hooks: { beforeLastStep?: () => void; afterStep?: () => void } = {},
    readonly maxSteps = 16,
  ) {}

  /** Advances by a frame of real time. Returns how many steps ran. */
  advance(realSeconds: number): number {
    this.acc += Math.min(0.05, realSeconds) * this.timeScale;
    let n = Math.floor(this.acc / this.dt);
    this.behind = n > this.maxSteps;
    if (this.behind) { n = this.maxSteps; this.acc = 0; } else this.acc -= n * this.dt;
    for (let i = 0; i < n; i++) {
      if (i === n - 1) this.hooks.beforeLastStep?.();
      this.sim.step();
      this.hooks.afterStep?.();
    }
    return n;
  }

  /** How far simulated time is past the last step, as a fraction of a step, for interpolation. */
  get alpha(): number {
    return Math.min(1, this.acc / this.dt);
  }

  resetClock(): void {
    this.acc = 0;
  }
}
