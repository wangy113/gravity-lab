/** Procedural lab sounds with Web Audio and no files (ported from the prototype). */
export class Synth {
  private ac: AudioContext | null = null;
  private master!: GainNode;
  private rumble!: GainNode;
  private hum!: GainNode;
  private noise!: AudioBuffer;
  private budget = 0;
  enabled = true;

  /** Must be called from a user gesture. Safe to call again. */
  init(): void {
    if (this.ac) {
      if (this.ac.state === 'suspended') void this.ac.resume();
      return;
    }
    try {
      const ac = new AudioContext();
      this.master = ac.createGain();
      this.master.gain.value = this.enabled ? 0.9 : 0;
      this.master.connect(ac.destination);
      this.noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const nd = this.noise.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const bb = ac.createBuffer(1, ac.sampleRate * 4, ac.sampleRate);
      const bd = bb.getChannelData(0);
      let l = 0;
      for (let i = 0; i < bd.length; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = l * 3.5; }
      const src = ac.createBufferSource();
      src.buffer = bb; src.loop = true;
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 140;
      this.rumble = ac.createGain();
      this.rumble.gain.value = 0;
      src.connect(lp).connect(this.rumble).connect(this.master);
      src.start();
      const o = ac.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = 58;
      const of = ac.createBiquadFilter();
      of.type = 'lowpass'; of.frequency.value = 260;
      this.hum = ac.createGain();
      this.hum.gain.value = 0;
      o.connect(of).connect(this.hum).connect(this.master);
      o.start();
      this.ac = ac;
    } catch {
      this.ac = null;
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.ac) this.master.gain.value = on ? 0.9 : 0;
  }

  impact(p: number, heavy: boolean, slow: boolean): void {
    const ac = this.ac;
    if (!ac || this.budget > 8) return;
    this.budget++;
    const t = ac.currentTime, k = slow ? 0.5 : 1;
    const n = ac.createBufferSource();
    n.buffer = this.noise; n.playbackRate.value = k;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = (heavy ? 260 : 1400 + 1800 * Math.random()) * k;
    const g = ac.createGain();
    const peak = (heavy ? 1.0 : 0.35) * (0.25 + 0.75 * p);
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (heavy ? 1.2 : 0.18) / k);
    n.connect(f).connect(g).connect(this.master);
    n.start(t, Math.random()); n.stop(t + 1.5 / k);
    if (heavy) {
      const o = ac.createOscillator();
      o.frequency.setValueAtTime(70 * k, t);
      o.frequency.exponentialRampToValueAtTime(28, t + 0.6 / k);
      const og = ac.createGain();
      og.gain.setValueAtTime(0.9 * p, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.8 / k);
      o.connect(og).connect(this.master);
      o.start(t); o.stop(t + 1 / k);
    }
  }

  crack(p: number): void {
    const ac = this.ac;
    if (!ac) return;
    const t = ac.currentTime;
    for (let i = 0; i < 5; i++) {
      const n = ac.createBufferSource();
      n.buffer = this.noise;
      const f = ac.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 1800 + Math.random() * 2500; f.Q.value = 2;
      const g = ac.createGain();
      const st = t + i * (0.03 + Math.random() * 0.06);
      g.gain.setValueAtTime(0.0001, t); g.gain.setValueAtTime(0.7 * p, st);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.07);
      n.connect(f).connect(g).connect(this.master);
      n.start(t, Math.random()); n.stop(st + 0.1);
    }
  }

  /** Once per frame: rumble follows table acceleration, hum while the table is live. */
  tick(accG: number, tableActive: boolean, live: boolean): void {
    this.budget = Math.max(0, this.budget - 0.5);
    const ac = this.ac;
    if (!ac) return;
    const t = ac.currentTime;
    this.rumble.gain.setTargetAtTime(live ? Math.min(1, accG * 2.2) * 0.9 : 0, t, 0.08);
    this.hum.gain.setTargetAtTime(live && tableActive ? 0.05 : 0, t, 0.2);
  }
}
