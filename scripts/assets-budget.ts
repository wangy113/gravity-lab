/**
 * Fails when the first load or the asset folder grows past the budgets in
 * docs/ARCHITECTURE.md 7.3. Run after `npm run build`.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MB = 1e6;
const BUDGET = { low: 10 * MB, medium: 20 * MB, high: 20 * MB, total: 60 * MB, prop: 1 * MB };

const manifest = JSON.parse(await readFile(join(ROOT, 'public/assets/manifest.json'), 'utf8')) as {
  hdris: { key: string; file: string; fileLow: string }[];
  textures: Record<string, { diffuse: string; normal: string; arm: string }>;
  models: Record<string, string>;
  sizes: Record<string, number>;
};
const sz = (f: string): number => manifest.sizes[f] ?? 0;

// App code as served (GitHub Pages compresses JS and CSS), plus the fonts.
let code = 0;
const built = join(ROOT, 'dist/assets');
for (const f of await readdir(built)) {
  if (/\.(js|css)$/.test(f)) code += gzipSync(await readFile(join(built, f))).length;
  else if (f.endsWith('.woff2')) code += (await stat(join(built, f))).size;
}
const textures = Object.values(manifest.textures).flatMap((t) => [t.diffuse, t.normal, t.arm]).reduce((s, f) => s + sz(f), 0);
const models = Object.values(manifest.models).reduce((s, f) => s + sz(f), 0);
const hall = manifest.hdris[0]!;
const first = { low: code + textures + models + sz(hall.fileLow), medium: code + textures + models + sz(hall.file) };
const total = Object.values(manifest.sizes).reduce((a, b) => a + b, 0);

const rows: [string, number, number][] = [
  ['First load, Low', first.low, BUDGET.low],
  ['First load, Medium and High', first.medium, BUDGET.medium],
  ['All assets', total, BUDGET.total],
  ...Object.entries(manifest.models).map(([id, f]): [string, number, number] => [`Prop ${id}`, sz(f), BUDGET.prop]),
];
let failed = false;
for (const [name, value, limit] of rows) {
  const ok = value <= limit;
  failed ||= !ok;
  console.log(`${ok ? 'ok  ' : 'OVER'} ${name.padEnd(40)} ${(value / MB).toFixed(2).padStart(6)} MB of ${(limit / MB).toFixed(0)} MB`);
}
console.log(`(app code and fonts: ${(code / MB).toFixed(2)} MB)`);
if (failed) process.exit(1);
