export type Vec3 = [number, number, number];

/** Something the audio, dust, replay, notebook and lessons react to. `t` is simulated time in seconds. */
export type SimEvent =
  | { kind: 'crack'; t: number; p: number; pos: Vec3 }
  | { kind: 'fail'; t: number; p: number; story: string; pos: Vec3 }
  | { kind: 'impact'; t: number; p: number; heavy: boolean; pos: Vec3 };
