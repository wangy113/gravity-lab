/**
 * Builds the optimized assets the app serves, from the raw Poly Haven files that
 * `npm run assets:sync` put in .cache/polyhaven/. Writes public/assets/ (committed):
 *   - models/<id>.glb      one file per prop: WebP textures (512 px), meshopt geometry
 *   - textures/<id>/*.webp building surfaces at 1k
 *   - hdri/<id>_1k.hdr and _2k.hdr
 *   - manifest.json        what the app loads, with sizes per quality tier
 *
 *   npm run assets:build
 *
 * WebP rather than KTX2: browsers decode it natively and it cuts the download, which is
 * what school networks need. KTX2 would also save GPU memory but needs an encoder
 * (KTX-Software) and a runtime transcoder, see docs/ARCHITECTURE.md 7.2.
 */
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const RAW = join(ROOT, '.cache/polyhaven');
const OUT = join(ROOT, 'public/assets');

interface Meta {
  hdris: { key: string; id: string; label: string; file: string; fileLow: string; groundHeight: number; sun: number[]; floorTint: number[] }[];
  textures: Record<string, { diffuse: string; normal: string; arm: string }>;
  models: Record<string, string>;
  credits: { id: string; name: string; type: string; authors: string[] }[];
}

const size = async (p: string): Promise<number> => (await stat(p)).size;
const mb = (n: number): string => `${(n / 1e6).toFixed(2)} MB`;
async function dirSize(dir: string): Promise<number> {
  let total = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) total += e.isDirectory() ? await dirSize(join(dir, e.name)) : await size(join(dir, e.name));
  return total;
}

async function webp(src: string, dst: string, quality: number, max = 1024): Promise<number> {
  await mkdir(dirname(dst), { recursive: true });
  await sharp(src).resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true }).webp({ quality, effort: 6 }).toFile(dst);
  return size(dst);
}

async function main(): Promise<void> {
  const meta = JSON.parse(await readFile(join(RAW, 'meta.json'), 'utf8')) as Meta;
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

  const runtime = { hdris: [] as unknown[], textures: {} as Meta['textures'], models: {} as Record<string, string>, credits: meta.credits, sizes: {} as Record<string, number> };

  for (const h of meta.hdris) {
    const file = `hdri/${h.id}_2k.hdr`, fileLow = `hdri/${h.id}_1k.hdr`;
    await mkdir(join(OUT, 'hdri'), { recursive: true });
    await copyFile(join(RAW, h.file), join(OUT, file));
    await copyFile(join(RAW, h.fileLow), join(OUT, fileLow));
    runtime.hdris.push({ ...h, file, fileLow });
    runtime.sizes[file] = await size(join(OUT, file));
    runtime.sizes[fileLow] = await size(join(OUT, fileLow));
    console.log(`HDRI ${h.id}: 2k ${mb(runtime.sizes[file]!)}, 1k ${mb(runtime.sizes[fileLow]!)}`);
  }

  for (const [id, t] of Object.entries(meta.textures)) {
    const out = { diffuse: `textures/${id}/diffuse.webp`, normal: `textures/${id}/normal.webp`, arm: `textures/${id}/arm.webp` };
    const before = (await size(join(RAW, t.diffuse))) + (await size(join(RAW, t.normal))) + (await size(join(RAW, t.arm)));
    let after = 0;
    after += runtime.sizes[out.diffuse] = await webp(join(RAW, t.diffuse), join(OUT, out.diffuse), 80);
    after += runtime.sizes[out.normal] = await webp(join(RAW, t.normal), join(OUT, out.normal), 90);
    after += runtime.sizes[out.arm] = await webp(join(RAW, t.arm), join(OUT, out.arm), 85);
    runtime.textures[id] = out;
    console.log(`Texture ${id}: ${mb(before)} -> ${mb(after)}`);
  }

  for (const [id, rel] of Object.entries(meta.models)) {
    const src = join(RAW, rel);
    const doc = await io.read(src);
    const before = await dirSize(dirname(src));
    await doc.transform(
      dedup(),
      prune(),
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 82 }),
      meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    );
    const file = `models/${id}.glb`;
    await mkdir(join(OUT, 'models'), { recursive: true });
    await io.write(join(OUT, file), doc);
    runtime.models[id] = file;
    runtime.sizes[file] = await size(join(OUT, file));
    console.log(`Model ${id}: ${mb(before)} -> ${mb(runtime.sizes[file]!)}`);
  }

  await writeFile(join(OUT, 'manifest.json'), JSON.stringify(runtime, null, 2) + '\n');
  const total = Object.values(runtime.sizes).reduce((a, b) => a + b, 0);
  console.log(`Done: ${mb(total)} in public/assets.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
