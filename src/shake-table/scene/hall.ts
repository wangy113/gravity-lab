/**
 * The test hall around the shake table: a modeled building instead of a photo backdrop.
 * The prototype stood the lab on a GroundedSkybox, a 360 degree photo projected onto a
 * dome. Its floor smeared near the table and the photo's scale never matched the 3D lab.
 * Here the walls, steel frame, roof, crane and fittings are real geometry at real scale,
 * and the HDRI only lights the scene and shows up in reflections.
 *
 * The shell is built at once from plain materials. Its textures and the dressing props are
 * "decor" assets: they load after the lab is usable and are swapped in when they arrive.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mesh, tiledBox } from './materials.ts';

/** Hall extent, m. The table centre is near x = -0.5. */
export const HALL = { x0: -30, x1: 26, z: 22, eave: 13, roof: 15.5 } as const;
const BAY = 8; // column spacing, m
const COLS = Array.from({ length: 7 }, (_, i) => HALL.x0 + 4 + i * BAY); // -26 ... 22

export interface HallMaterials {
  floor: THREE.MeshStandardMaterial;
  block: THREE.MeshStandardMaterial;
  cladding: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
}

export interface HallView {
  group: THREE.Group;
  mats: HallMaterials;
  /** Places the dressing props once their models have loaded. */
  dress(models: Record<string, THREE.Object3D>): void;
  /** Keeps a camera position inside the hall. */
  clamp(p: THREE.Vector3): void;
}

const std = (color: number, roughness = 0.8, metalness = 0): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness, metalness });

/** Copies a loaded texture set into a placeholder material, keeping its tint. */
export function upgradeMaterial(target: THREE.MeshStandardMaterial, loaded: THREE.MeshStandardMaterial, tint: [number, number, number] = [1, 1, 1]): void {
  if (!loaded.map) return;
  Object.assign(target, {
    map: loaded.map, normalMap: loaded.normalMap, aoMap: loaded.aoMap, roughnessMap: loaded.roughnessMap, metalnessMap: loaded.metalnessMap,
    roughness: 1, metalness: loaded.metalness,
  });
  target.color.setRGB(...tint, THREE.LinearSRGBColorSpace);
  target.needsUpdate = true;
}

/** Instanced boxes from segment end points: thin members such as truss bars and rails. */
function bars(segs: [THREE.Vector3, THREE.Vector3][], w: number, d: number, mat: THREE.Material, castShadow = false): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(w, 1, d), mat, segs.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), mid = new THREE.Vector3(), dir = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  segs.forEach(([a, b], i) => {
    dir.subVectors(b, a);
    const len = dir.length();
    q.setFromUnitVectors(up, dir.normalize());
    mid.addVectors(a, b).multiplyScalar(0.5);
    im.setMatrixAt(i, m.compose(mid, q, s.set(1, len, 1)));
  });
  im.castShadow = castShadow;
  im.receiveShadow = true;
  return im;
}

/** Scales a model uniformly to a height, stands it on y = 0 and centres it. */
function fit(src: THREE.Object3D, height: number): THREE.Object3D {
  const o = src.clone(true);
  const box = new THREE.Box3().setFromObject(o);
  const size = box.getSize(new THREE.Vector3());
  const k = height / (size.y || 1);
  o.scale.multiplyScalar(k);
  const c = box.getCenter(new THREE.Vector3()).multiplyScalar(k);
  const inner = new THREE.Group();
  o.position.set(-c.x, -box.min.y * k, -c.z);
  inner.add(o);
  return inner;
}

/** A painted sign as a canvas texture. Text follows the lab's style rules (no em dashes or semicolons). */
function sign(lines: string[], w: number, h: number, bg: string, fg: string, border?: string): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = Math.round((1024 * h) / w);
  const x = c.getContext('2d')!;
  x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height);
  if (border) { x.strokeStyle = border; x.lineWidth = c.height * 0.06; x.strokeRect(0, 0, c.width, c.height); }
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
  const fs = Math.min((c.height / lines.length) * 0.62, (c.width / Math.max(...lines.map((l) => l.length))) * 1.45);
  x.font = `700 ${fs}px Barlow, Arial, sans-serif`;
  lines.forEach((l, i) => x.fillText(l, c.width / 2, ((i + 0.5) * c.height) / lines.length));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }));
  m.receiveShadow = true;
  return m;
}

export function buildHall(floorMat: THREE.MeshStandardMaterial): HallView {
  const g = new THREE.Group();
  g.name = 'hall';
  const { x0, x1, z: Z, eave, roof } = HALL;
  const L = x1 - x0, cx = (x0 + x1) / 2;

  const mats: HallMaterials = {
    floor: floorMat.clone(),
    block: std(0x9d9890, 0.9),
    cladding: std(0x8e979e, 0.6, 0.4),
    roof: std(0x7c838a, 0.6, 0.4),
  };
  mats.floor.color.set(0xb9b4ac);
  const steel = std(0x4f5f6c, 0.5, 0.6);
  const yellow = std(0xf2b51d, 0.45, 0.2);
  const dark = std(0x23272b, 0.6, 0.3);
  const add = (o: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Object3D => { o.position.set(x, y, z); g.add(o); return o; };

  // Floor: sealed concrete in world-scale tiles, with painted walkway lines.
  const floorGeo = new THREE.PlaneGeometry(L, 2 * Z);
  floorGeo.rotateX(-Math.PI / 2);
  const fuv = floorGeo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < fuv.count; i++) fuv.setXY(i, (fuv.getX(i) * L) / 3, (fuv.getY(i) * 2 * Z) / 3);
  add(mesh(floorGeo, mats.floor, false, true), cx, 0, 0);
  const paint = new THREE.MeshStandardMaterial({ color: 0xe8b21c, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2 });
  const line = (x: number, z: number, w: number, d: number): void => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), paint);
    p.receiveShadow = true;
    add(p, x, 0.003, z);
  };
  // test area box around the pit and props, and walkways along both long walls
  const A = { x0: -9.5, x1: 9, z: 7.5 };
  line((A.x0 + A.x1) / 2, A.z, A.x1 - A.x0, 0.12); line((A.x0 + A.x1) / 2, -A.z, A.x1 - A.x0, 0.12);
  line(A.x0, 0, 0.12, 2 * A.z); line(A.x1, 0, 0.12, 2 * A.z);
  for (const s of [-1, 1]) { line(cx, s * (Z - 3.5), L - 2, 0.1); line(cx, s * (Z - 1.2), L - 2, 0.1); }

  // Walls: concrete block below, metal cladding above, a window band on the long walls.
  const WIN0 = 9, WIN1 = 11.2, T = 0.3;
  const wall = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, tile: number): void => {
    add(mesh(tiledBox(w, h, d, tile), m, false, true), x, y, z);
  };
  for (const s of [-1, 1]) {
    const z = s * (Z + T / 2);
    wall(L, 3.2, T, cx, 1.6, z, mats.block, 2.4);
    wall(L, WIN0 - 3.2, T, cx, (3.2 + WIN0) / 2, z, mats.cladding, 3);
    wall(L, roof - WIN1, T, cx, (WIN1 + roof) / 2, z, mats.cladding, 3);
  }
  for (const x of [x0 - T / 2, x1 + T / 2]) {
    wall(T, 3.2, 2 * Z, x, 1.6, 0, mats.block, 2.4);
    wall(T, roof - 3.2, 2 * Z, x, (3.2 + roof) / 2, 0, mats.cladding, 3);
  }
  // Windows: bright glazing (the sky outside) behind a grid of mullions.
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fb4c4, emissive: 0xdfeefa, emissiveIntensity: 1.1, roughness: 0.2 });
  const mullion = std(0x2b3036, 0.5, 0.5);
  const mulls: [THREE.Vector3, THREE.Vector3][] = [];
  for (const s of [-1, 1]) {
    const z = s * (Z + 0.2);
    add(new THREE.Mesh(new THREE.PlaneGeometry(L, WIN1 - WIN0).rotateY(s > 0 ? Math.PI : 0), glass), cx, (WIN0 + WIN1) / 2, z);
    for (let x = x0; x <= x1 + 0.01; x += 2) mulls.push([new THREE.Vector3(x, WIN0, z - s * 0.06), new THREE.Vector3(x, WIN1, z - s * 0.06)]);
    const mid = (WIN0 + WIN1) / 2;
    mulls.push([new THREE.Vector3(x0, mid, z - s * 0.06), new THREE.Vector3(x1, mid, z - s * 0.06)]);
  }
  g.add(bars(mulls, 0.09, 0.09, mullion));

  // Steel portal frame: I-section columns along the long walls.
  const flange = new THREE.BoxGeometry(0.42, eave, 0.04), web = new THREE.BoxGeometry(0.03, eave, 0.5);
  const iSec = mergeGeometries([flange.clone().translate(0, 0, -0.25), flange.clone().translate(0, 0, 0.25), web]);
  const cols = new THREE.InstancedMesh(iSec, steel, COLS.length * 2);
  const mtx = new THREE.Matrix4();
  COLS.forEach((x, i) => {
    cols.setMatrixAt(2 * i, mtx.makeTranslation(x, eave / 2, -(Z - 0.3)));
    cols.setMatrixAt(2 * i + 1, mtx.makeTranslation(x, eave / 2, Z - 0.3));
  });
  cols.castShadow = false; cols.receiveShadow = true;
  g.add(cols);

  // Roof trusses spanning the hall, purlins, roof sheeting and skylights.
  const BOT = eave, TOPC = roof - 0.35, PANEL = 2.75;
  const chords: [THREE.Vector3, THREE.Vector3][] = [], webs: [THREE.Vector3, THREE.Vector3][] = [];
  for (const x of COLS) {
    chords.push([new THREE.Vector3(x, BOT, -Z), new THREE.Vector3(x, BOT, Z)], [new THREE.Vector3(x, TOPC, -Z), new THREE.Vector3(x, TOPC, Z)]);
    let k = 0;
    for (let z = -Z; z < Z - 0.01; z += PANEL, k++) {
      const z2 = Math.min(z + PANEL, Z);
      webs.push([new THREE.Vector3(x, BOT, z2), new THREE.Vector3(x, TOPC, z2)]);
      webs.push(k % 2 ? [new THREE.Vector3(x, BOT, z), new THREE.Vector3(x, TOPC, z2)] : [new THREE.Vector3(x, TOPC, z), new THREE.Vector3(x, BOT, z2)]);
    }
  }
  for (let z = -Z + 1.5; z < Z; z += 3) chords.push([new THREE.Vector3(x0, roof - 0.12, z), new THREE.Vector3(x1, roof - 0.12, z)]);
  g.add(bars(chords, 0.22, 0.22, steel), bars(webs, 0.1, 0.1, steel));
  const roofGeo = tiledBox(L, 0.1, 2 * Z, 2.5);
  add(mesh(roofGeo, mats.roof, false, true), cx, roof + 0.05, 0);
  const sky = new THREE.MeshStandardMaterial({ color: 0xc8d6e0, emissive: 0xf2f8ff, emissiveIntensity: 1.3, roughness: 0.3 });
  for (const z of [-11, 0, 11]) for (let i = 0; i < COLS.length - 1; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(BAY - 2.5, 2.4).rotateX(Math.PI / 2), sky);
    add(p, COLS[i]! + BAY / 2, roof - 0.01, z);
  }

  // Overhead bridge crane: runway beams on brackets, a yellow girder, trolley and hook.
  const RUN_Y = 10.4;
  for (const s of [-1, 1]) {
    add(mesh(new THREE.BoxGeometry(L, 0.7, 0.36), steel, false, true), cx, RUN_Y, s * (Z - 1.1));
    add(mesh(new THREE.BoxGeometry(L, 0.08, 0.1), dark, false, true), cx, RUN_Y + 0.39, s * (Z - 1.1));
    for (const x of COLS) add(mesh(new THREE.BoxGeometry(0.3, 0.6, 1.0), steel, false, true), x, RUN_Y - 0.6, s * (Z - 0.8));
  }
  const crane = new THREE.Group();
  crane.add(mesh(new THREE.BoxGeometry(0.9, 1.3, 2 * Z - 2.4), yellow, true, true));
  for (const s of [-1, 1]) {
    const truck = mesh(new THREE.BoxGeometry(3.2, 0.7, 0.9), yellow, true, true);
    truck.position.set(0, 0.2, s * (Z - 1.1));
    crane.add(truck);
  }
  const trolley = mesh(new THREE.BoxGeometry(2.4, 0.9, 2.0), yellow, true, true);
  trolley.position.set(0, 1.1, -3);
  const drum = mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.6, 20).rotateZ(Math.PI / 2), dark, true, true);
  drum.position.set(0, 1.0, -3);
  crane.add(trolley, drum);
  const ropeLen = RUN_Y + 0.4 - 6.2;
  for (const dx of [-0.12, 0.12]) {
    const rope = mesh(new THREE.CylinderGeometry(0.02, 0.02, ropeLen, 8), dark, true, false);
    rope.position.set(dx, 0.4 - ropeLen / 2, -3);
    crane.add(rope);
  }
  const block = mesh(new THREE.BoxGeometry(0.5, 0.7, 0.35), yellow, true, true);
  block.position.set(0, 0.4 - ropeLen - 0.35, -3);
  const hook = mesh(new THREE.TorusGeometry(0.18, 0.05, 10, 24, Math.PI * 1.4), dark, true, false);
  hook.rotation.z = Math.PI * 0.8;
  hook.position.set(0, 0.4 - ropeLen - 0.9, -3);
  const cap = sign(['20 t'], 0.9, 0.5, '#f2b51d', '#151515');
  cap.position.set(0.46, 0, 8); cap.rotation.y = Math.PI / 2;
  crane.add(block, hook, cap);
  add(crane, -20, RUN_Y + 0.9, 0);

  // Guard rail around the test area, open on the +x side for access.
  const rail = std(0xf2b51d, 0.5, 0.3);
  const R = { x0: -7.3, x1: 6.3, z: 5.2 }, posts: [THREE.Vector3, THREE.Vector3][] = [], rails: [THREE.Vector3, THREE.Vector3][] = [];
  const run = (a: THREE.Vector2, b: THREE.Vector2): void => {
    const n = Math.max(1, Math.round(a.distanceTo(b) / 2));
    for (let i = 0; i <= n; i++) { const p = a.clone().lerp(b, i / n); posts.push([new THREE.Vector3(p.x, 0, p.y), new THREE.Vector3(p.x, 1.1, p.y)]); }
    for (const h of [0.55, 1.08]) rails.push([new THREE.Vector3(a.x, h, a.y), new THREE.Vector3(b.x, h, b.y)]);
  };
  run(new THREE.Vector2(R.x1, -R.z), new THREE.Vector2(R.x0, -R.z));
  run(new THREE.Vector2(R.x0, -R.z), new THREE.Vector2(R.x0, R.z));
  run(new THREE.Vector2(R.x0, R.z), new THREE.Vector2(R.x1, R.z));
  g.add(bars(posts, 0.06, 0.06, rail, true), bars(rails, 0.045, 0.045, rail, true));

  // Control booth in the far corner: low wall, glazing, roof and a desk of glowing monitors.
  const booth = new THREE.Group();
  const BW = 7, BD = 5, BH = 3;
  const white = std(0xd8dadc, 0.7);
  booth.add(...[
    [BW, 1.0, 0.15, 0, 0.5, BD / 2], [BW, 1.0, 0.15, 0, 0.5, -BD / 2], [0.15, 1.0, BD, -BW / 2, 0.5, 0], [0.15, 1.0, BD, BW / 2, 0.5, 0],
    [BW + 0.3, 0.25, BD + 0.3, 0, BH + 0.12, 0],
  ].map(([w, h, d, x, y, z]) => { const m = mesh(new THREE.BoxGeometry(w!, h!, d!), white, true, true); m.position.set(x!, y!, z!); return m; }));
  const pane = new THREE.MeshPhysicalMaterial({ color: 0xaac4d4, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22 });
  for (const [w, d, x, z] of [[BW, 0.04, 0, BD / 2], [BW, 0.04, 0, -BD / 2], [0.04, BD, -BW / 2, 0], [0.04, BD, BW / 2, 0]] as const) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(w, BH - 1, d), pane);
    p.position.set(x, 1 + (BH - 1) / 2, z);
    booth.add(p);
  }
  const frame: [THREE.Vector3, THREE.Vector3][] = [];
  for (const [x, z] of [[-BW / 2, -BD / 2], [BW / 2, -BD / 2], [-BW / 2, BD / 2], [BW / 2, BD / 2], [0, BD / 2], [0, -BD / 2]] as const) frame.push([new THREE.Vector3(x, 1, z), new THREE.Vector3(x, BH, z)]);
  booth.add(bars(frame, 0.08, 0.08, dark));
  const desk = mesh(new THREE.BoxGeometry(4.2, 0.08, 1.0), dark, true, true);
  desk.position.set(0, 0.76, -BD / 2 + 0.9);
  booth.add(desk);
  const screen = new THREE.MeshStandardMaterial({ color: 0x0b1a26, emissive: 0x3aa0d8, emissiveIntensity: 0.9, roughness: 0.3 });
  for (const x of [-1.3, 0, 1.3]) {
    const mon = mesh(new THREE.BoxGeometry(0.9, 0.55, 0.05), screen, true, false);
    mon.position.set(x, 1.15, -BD / 2 + 0.6);
    booth.add(mon);
  }
  const bsign = sign(['CONTROL ROOM'], 3.2, 0.5, '#1d2328', '#f2b51d');
  bsign.position.set(0, BH + 0.55, BD / 2 + 0.17);
  booth.add(bsign);
  booth.rotation.y = Math.PI;
  add(booth, 16, 0, -14);

  // Signs on the long wall facing the default camera.
  const title = sign(['STRUCTURAL TEST HALL'], 14, 1.6, '#24323d', '#f4f1ea');
  add(title, -6, 6.4, -(Z - 0.02));
  const caution = sign(['CAUTION', 'SHAKE TABLE IN USE', 'STAY BEHIND THE RAIL'], 3.0, 2.0, '#f2b51d', '#151515', '#151515');
  add(caution, -12.5, 2.0, -(Z - 0.02));
  const ppe = sign(['HARD HATS', 'REQUIRED'], 2.2, 1.4, '#1f5fae', '#ffffff', '#ffffff');
  add(ppe, 3, 2.0, -(Z - 0.02));
  const exit = sign(['EXIT'], 1.2, 0.45, '#1c7c3c', '#ffffff');
  add(exit, x1 - 0.02, 7.4, -8).rotation.y = -Math.PI / 2;

  const dress = (models: Record<string, THREE.Object3D>): void => {
    const place = (id: string, h: number, x: number, z: number, ry = 0, y = 0): void => {
      const src = models[id];
      if (!src) return;
      const o = fit(src, h);
      o.position.set(x, y, z);
      o.rotation.y = ry;
      g.add(o);
    };
    for (let i = 0; i < 4; i++) place('steel_frame_shelves_01', 2.4, -24 + i * 3.1, -(Z - 0.75), 0);
    for (let i = 0; i < 3; i++) place('steel_frame_shelves_01', 2.4, 10 + i * 3.1, Z - 0.75, Math.PI);
    for (const [x, z] of [[-27.6, -15], [-26.9, -15.3], [-27.3, -14.3], [-27.9, -13.6], [-26.6, -14.0]] as const) place('barrel_03', 0.9, x, z, x * 3);
    place('rollershutter_door', 6, x1 - 0.12, 8, -Math.PI / 2);
    place('portable_generator', 0.62, 20.5, 17.5, 2.2);
    place('power_box_01', 0.55, -2, -(Z - 0.25), 0, 1.4);
    place('power_box_01', 0.55, 12, -(Z - 0.25), 0, 1.4);
    place('ladder_sectioned_01', 3.2, -18.4, Z - 0.45, Math.PI);
    for (let i = 0; i < COLS.length - 1; i++) for (const z of [-11, 0, 11]) place('hanging_industrial_lamp', 1.3, COLS[i]! + BAY / 2, z, 0, BOT - 1.3);
  };

  const clamp = (p: THREE.Vector3): void => {
    p.x = THREE.MathUtils.clamp(p.x, x0 + 1.2, x1 - 1.2);
    p.z = THREE.MathUtils.clamp(p.z, -Z + 1.2, Z - 1.2);
    p.y = THREE.MathUtils.clamp(p.y, 0.3, eave - 0.8);
  };

  return { group: g, mats, dress, clamp };
}
