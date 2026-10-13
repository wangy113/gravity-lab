/**
 * Downloads the Poly Haven assets listed in assets/manifest.json into public/assets/,
 * verifies each file against the md5 the API reports, and writes:
 *   - public/assets/manifest.json            what the app loads at runtime
 *   - assets/assets.lock.json                 sources, hashes, sizes, authors, license (committed)
 *   - src/shake-table/contents/prop-sizes.json bounding boxes the physics needs (committed)
 *
 *   npm run assets:sync            download what is missing or changed
 *   npm run assets:sync -- --check  verify local files against the lock file, download nothing
 *
 * The Poly Haven API is used here only, never by students' browsers. Its terms ask every
 * client to identify itself, hence the User-Agent below.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Box3, FloatType, Matrix4, Quaternion, Vector3 } from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

// Node's fetch only honours HTTPS_PROXY when asked to.
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
  process.exit(r.status ?? 1);
}

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'public/assets');
const API = 'https://api.polyhaven.com';
const UA = 'gravity-lab-asset-sync (+https://github.com/wangy113/gravity-lab)';
const CHECK = process.argv.includes('--check');

interface Manifest {
  hdris: { id: string; key: string; label: string; res: string; groundHeight: number }[];
  textures: { id: string; res: string }[];
  models: { id: string; res: string; physical?: boolean }[];
}
interface PhFile { url: string; md5: string; size: number; include?: Record<string, PhFile> }
interface LockFile { path: string; url: string; md5: string; size: number }
interface LockEntry { id: string; type: 'hdri' | 'texture' | 'model'; name: string; authors: string[]; license: 'CC0'; filesHash: string; files: LockFile[] }

const md5 = (b: Uint8Array): string => createHash('md5').update(b).digest('hex');

async function api<T>(path: string): Promise<T> {
  const r = await fetch(API + path, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return (await r.json()) as T;
}

async function readIfValid(path: string, hash: string): Promise<Buffer | null> {
  try {
    const b = await readFile(path);
    return md5(b) === hash ? b : null;
  } catch {
    return null;
  }
}

/** Downloads one file unless a copy with the right md5 is already there. */
async function fetchFile(rel: string, f: PhFile): Promise<Buffer> {
  const path = join(OUT, rel);
  const have = await readIfValid(path, f.md5);
  if (have) return have;
  if (CHECK) throw new Error(`${rel} is missing or changed`);
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(f.url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const b = Buffer.from(await r.arrayBuffer());
      if (md5(b) !== f.md5) throw new Error('md5 mismatch');
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, b);
      console.log(`  downloaded ${rel} (${(b.length / 1e6).toFixed(2)} MB)`);
      return b;
    } catch (e) {
      if (attempt >= 4) throw new Error(`${f.url}: ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
    }
  }
}

/** The prototype's `placeSun`: brightest pixel in the upper part of the HDRI. */
function sunDirection(data: Float32Array, W: number, H: number): [number, number, number] {
  let best = -1, bx = 0, by = 0;
  for (let y = 2; y < H * 0.42; y += 2) for (let x = 0; x < W; x += 2) {
    const i = (y * W + x) * 4;
    const l = 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
    if (l > best) { best = l; bx = x; by = y; }
  }
  const ang = (bx / W - 0.5) * Math.PI * 2;
  const lat = Math.max((0.5 - by / H) * Math.PI, 0.75);
  return [Math.cos(ang) * Math.cos(lat), Math.sin(lat), Math.sin(ang) * Math.cos(lat)].map((v) => +v.toFixed(5)) as [number, number, number];
}

/** The prototype's `tintFloor`: average floor colour, normalized, 35% toward white. */
function floorTint(data: Float32Array, W: number, H: number): [number, number, number] {
  let r = 0, g = 0, b = 0;
  for (let y = Math.floor(H * 0.66); y < H * 0.86; y += 3) for (let x = 0; x < W; x += 3) {
    const i = (y * W + x) * 4;
    r += data[i]!; g += data[i + 1]!; b += data[i + 2]!;
  }
  const mx = Math.max(r, g, b) || 1;
  return [r / mx, g / mx, b / mx].map((v) => +(v + (1 - v) * 0.35).toFixed(5)) as [number, number, number];
}

interface GltfNode { mesh?: number; children?: number[]; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }
interface Gltf {
  scene?: number; scenes: { nodes: number[] }[]; nodes: GltfNode[];
  meshes: { primitives: { attributes: { POSITION: number } }[] }[];
  accessors: { min?: number[]; max?: number[] }[];
}

/** Bounding box of a glTF scene, as three's Box3.setFromObject computes it (geometry boxes, transformed). */
function gltfSize(g: Gltf): { x: number; y: number; z: number } {
  const box = new Box3();
  const visit = (n: number, parent: Matrix4): void => {
    const node = g.nodes[n]!;
    const local = new Matrix4();
    if (node.matrix) local.fromArray(node.matrix);
    else local.compose(new Vector3(...(node.translation ?? [0, 0, 0])), new Quaternion(...(node.rotation ?? [0, 0, 0, 1])), new Vector3(...(node.scale ?? [1, 1, 1])));
    const world = parent.clone().multiply(local);
    if (node.mesh !== undefined) for (const p of g.meshes[node.mesh]!.primitives) {
      const a = g.accessors[p.attributes.POSITION]!;
      if (!a.min || !a.max) throw new Error('POSITION accessor without min and max');
      box.union(new Box3(new Vector3(...a.min), new Vector3(...a.max)).applyMatrix4(world));
    }
    for (const c of node.children ?? []) visit(c, world);
  };
  for (const n of g.scenes[g.scene ?? 0]!.nodes) visit(n, new Matrix4());
  const s = box.getSize(new Vector3());
  return { x: +s.x.toFixed(5), y: +s.y.toFixed(5), z: +s.z.toFixed(5) };
}

async function main(): Promise<void> {
  const manifest = JSON.parse(await readFile(join(ROOT, 'assets/manifest.json'), 'utf8')) as Manifest;
  const lock: LockEntry[] = [];
  const runtime = {
    hdris: [] as { key: string; id: string; label: string; file: string; groundHeight: number; sun: number[]; floorTint: number[] }[],
    textures: {} as Record<string, { diffuse: string; normal: string; arm: string }>,
    models: {} as Record<string, string>,
    credits: [] as { id: string; name: string; type: string; authors: string[] }[],
  };
  const propSizes: Record<string, { x: number; y: number; z: number }> = {};

  const info = async (id: string, type: LockEntry['type']) => {
    const i = await api<{ name: string; authors: Record<string, string>; files_hash: string }>(`/info/${id}`);
    const entry: LockEntry = { id, type, name: i.name, authors: Object.keys(i.authors), license: 'CC0', filesHash: i.files_hash, files: [] };
    lock.push(entry);
    runtime.credits.push({ id, name: i.name, type, authors: entry.authors });
    return entry;
  };
  const take = async (entry: LockEntry, rel: string, f: PhFile): Promise<Buffer> => {
    const b = await fetchFile(rel, f);
    entry.files.push({ path: rel, url: f.url, md5: f.md5, size: f.size });
    return b;
  };

  for (const h of manifest.hdris) {
    console.log(`HDRI ${h.id}`);
    const entry = await info(h.id, 'hdri');
    const files = await api<{ hdri: Record<string, Record<string, PhFile>> }>(`/files/${h.id}`);
    const f = files.hdri[h.res]!.hdr!;
    const rel = `hdri/${h.id}_${h.res}.hdr`;
    const b = await take(entry, rel, f);
    const tex = new HDRLoader().setDataType(FloatType).parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    const data = tex.data as Float32Array;
    runtime.hdris.push({ key: h.key, id: h.id, label: h.label, file: rel, groundHeight: h.groundHeight, sun: sunDirection(data, tex.width, tex.height), floorTint: floorTint(data, tex.width, tex.height) });
  }

  for (const t of manifest.textures) {
    console.log(`Texture ${t.id}`);
    const entry = await info(t.id, 'texture');
    const files = await api<Record<string, Record<string, Record<string, PhFile>>>>(`/files/${t.id}`);
    const pick = async (map: string) => {
      const f = files[map]![t.res]!.jpg!;
      const rel = `textures/${t.id}/${f.url.split('/').pop()}`;
      await take(entry, rel, f);
      return rel;
    };
    runtime.textures[t.id] = { diffuse: await pick('Diffuse'), normal: await pick('nor_gl'), arm: await pick('arm') };
  }

  for (const m of manifest.models) {
    console.log(`Model ${m.id}`);
    const entry = await info(m.id, 'model');
    const files = await api<{ gltf: Record<string, { gltf: PhFile }> }>(`/files/${m.id}`);
    const g = files.gltf[m.res]!.gltf;
    const name = g.url.split('/').pop()!;
    const rel = `models/${m.id}/${name}`;
    const b = await take(entry, rel, g);
    for (const [path, f] of Object.entries(g.include ?? {})) await take(entry, `models/${m.id}/${path}`, f);
    runtime.models[m.id] = rel;
    if (m.physical) propSizes[m.id] = gltfSize(JSON.parse(b.toString('utf8')) as Gltf);
  }

  await writeFile(join(OUT, 'manifest.json'), JSON.stringify(runtime, null, 2) + '\n');
  await writeFile(join(ROOT, 'assets/assets.lock.json'), JSON.stringify({ note: 'Generated by npm run assets:sync. Poly Haven assets are CC0.', assets: lock }, null, 2) + '\n');
  await writeFile(join(ROOT, 'src/shake-table/contents/prop-sizes.json'), JSON.stringify(propSizes, null, 2) + '\n');
  const total = lock.flatMap((e) => e.files).reduce((s, f) => s + f.size, 0);
  console.log(`Done: ${lock.length} assets, ${(total / 1e6).toFixed(1)} MB in public/assets.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
