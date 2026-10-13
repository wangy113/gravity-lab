import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
import './styles.css';
import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import { render } from 'preact';
import { loadManifest } from './core/assets/manifest.ts';
import { Controller } from './shake-table/controller.ts';
import { Lab } from './shake-table/lab.ts';
import { LabView } from './shake-table/scene/view.ts';
import { App } from './shake-table/ui/app.tsx';
import { ui } from './shake-table/ui/store.ts';

async function boot(): Promise<void> {
  await RAPIER.init();
  const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
  const view = new LabView(canvas);
  const lab = new Lab(RAPIER, 'bare');
  const ctl = new Controller(lab, view);
  render(<App ctl={ctl} />, document.querySelector('#app')!);

  ui.loadMsg.value = 'Loading the lab hall';
  const manifest = await loadManifest();
  ui.credits.value = manifest?.credits ?? [];
  let done = 0;
  const total = view.loadSteps + 1;
  const step = (msg?: string): void => {
    done++;
    ui.loadProgress.value = Math.min(100, (100 * done) / total);
    if (msg) ui.loadMsg.value = msg;
  };
  step();
  await Promise.race([view.load(manifest, ui.hall.value, step), new Promise((r) => setTimeout(r, 25_000))]);
  ctl.setMode(ui.mode.value);
  ctl.setF(ui.f.value);
  ctl.setG(ui.g.value);
  ctl.setType('bare');
  ui.loading.value = false;

  addEventListener('resize', () => view.resize());
  // Read the hash before showStop() rewrites it.
  const hash = location.hash, m = hash.match(/stop=(\d+)/), run = /run/.test(hash);
  if (m) {
    ctl.showStop(+m[1]! - 1);
    if (run) ctl.runStop();
  } else ui.dialog.value = 'intro';

  if (import.meta.env.DEV || new URLSearchParams(location.search).has('test')) {
    (window as unknown as { __lab: unknown }).__lab = { lab, view, ctl, ui };
  }
  const loop = (now: number): void => {
    requestAnimationFrame(loop);
    ctl.frame(now);
  };
  requestAnimationFrame(loop);
}

boot().catch((e: Error) => {
  ui.loadMsg.value = `Something failed to load: ${e.message}`;
  console.error(e);
});
