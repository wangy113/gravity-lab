/** The lab's UI, ported from the prototype's markup. Element ids are kept for tests. */
import { useEffect, useRef } from 'preact/hooks';
import type { Controller } from '../controller.ts';
import { STOPS, TAG_NAMES } from '../tour.ts';
import { ui } from './store.ts';

type Ctl = { ctl: Controller };

function Seg<T extends string | number>(p: { id: string; label: string; value: T; options: [T, string][]; onPick: (v: T) => void }) {
  return (
    <div class="seg" id={p.id} role="group" aria-label={p.label}>
      {p.options.map(([v, text]) => (
        <button type="button" data-v={String(v)} aria-pressed={p.value === v} onClick={() => p.onPick(v)}>{text}</button>
      ))}
    </div>
  );
}

function Header({ ctl }: Ctl) {
  return (
    <header class="bar">
      <div class="title card"><b>Shake Table Lab</b><small>Build it. Shake it. Break it. Replay it.</small></div>
      <div class="spacer" />
      <button type="button" class="btn primary" id="guideBtn" onClick={() => ctl.showStop(ui.stop.value ?? 0)}>Guide me</button>
      <button type="button" class="btn" id="textBtn" onClick={() => (ui.dialog.value = 'text')}>Text version</button>
      <button type="button" class="btn" id="aboutBtn" onClick={() => (ui.dialog.value = 'about')}>About</button>
      <button type="button" class="btn" id="soundBtn" aria-pressed={ui.sound.value} onClick={() => ctl.setSound(!ui.sound.value)}>{ui.sound.value ? 'Sound on' : 'Sound off'}</button>
    </header>
  );
}

function ControlRoom({ ctl }: Ctl) {
  return (
    <section id="console" class="card" aria-label="Control room">
      <h2 class="k">Control room</h2>
      <div class="group"><div class="lbl">Building</div>
        <Seg id="segType" label="Building type" value={ui.type.value} onPick={(v) => ctl.setType(v)} options={[['bare', 'Bare frame'], ['braced', 'Braced'], ['isolated', 'Isolated']]} />
      </div>
      <div class="group"><div class="lbl">Shaking</div>
        <Seg id="segMode" label="Shaking type" value={ui.mode.value} onPick={(v) => ctl.setMode(v)} options={[['steady', 'Steady'], ['sweep', 'Sweep'], ['quake', 'Quake']]} />
      </div>
      <div class="group">
        <label class="lbl" for="freq">Frequency <output id="freqOut">{ui.f.value.toFixed(2)} Hz</output></label>
        <input type="range" id="freq" min="0.5" max="4" step="0.05" value={ui.f.value} disabled={ui.mode.value !== 'steady'} onInput={(e) => ctl.setF(+e.currentTarget.value)} />
      </div>
      <div class="group">
        <label class="lbl" for="strength">Strength <output id="gOut">{ui.g.value.toFixed(2)} g</output></label>
        <input type="range" id="strength" min="0.05" max="0.6" step="0.01" value={ui.g.value} onInput={(e) => ctl.setG(+e.currentTarget.value)} />
      </div>
      <button type="button" id="shakeBtn" class={`shake${ui.shaking.value ? ' on' : ''}`} onClick={() => ctl.toggleShake()}>{ui.shaking.value ? 'Stop' : 'Shake'}</button>
      <div class="row3">
        <button type="button" id="resetBtn" class="btn" onClick={() => ctl.setType(ui.type.value)}>Reset</button>
        <button type="button" id="slowBtn" class="btn" aria-pressed={ui.slow.value} onClick={() => ctl.setSlow(!ui.slow.value)}>Slow-mo</button>
        <button type="button" id="replayBtn" class="btn" aria-pressed={ui.replayOn.value} onClick={() => ctl.toggleReplay()}>Replay</button>
      </div>
      <div class="group"><div class="lbl">Camera</div>
        <Seg id="segCam" label="Camera" value={ui.cam.value} onPick={(v) => ctl.setCamera(v)} options={[['orbit', 'Orbit'], ['side', 'High speed'], ['ride', 'Ride floor 2']]} />
      </div>
      <div class="two">
        <button type="button" id="stressBtn" class="btn" aria-pressed={ui.stress.value} onClick={() => ctl.setStress(!ui.stress.value)}>Stress colors</button>
        <label><span class="lbl">Lab hall</span>
          <select id="hall" value={ui.hall.value} onChange={(e) => void ctl.setHall(e.currentTarget.value)}>
            <option value="aircraft">Test workshop</option><option value="hangar">Hangar</option><option value="foundry">Foundry hall</option>
          </select>
        </label>
      </div>
    </section>
  );
}

function Instruments() {
  return (
    <section id="readouts" class="card" aria-label="Instruments">
      <h2 class="k">Instruments</h2>
      <div class="ro"><span>Table frequency</span><b id="roF">{ui.tableF.value}</b></div>
      <div class="ro"><span>Table acceleration</span><b id="roA">{ui.tableA.value}</b></div>
      <div class="ro"><span>Roof swing</span><b id="roD">{ui.roof.value}</b></div>
      <div class="ro"><span>Natural beat (model)</span><b id="roN">{ui.natBeat.value}</b></div>
      <div class="note" id="peakNote" aria-live="polite">{ui.peakNote.value}</div>
      <div class="stories" id="stories">
        {ui.stories.value.map((s) => (
          <div class="story" key={s.label}>
            <span>{s.label}</span>
            <span class={`pill ${s.status}`}>{s.status === 'fail' ? 'Failed' : s.status === 'crack' ? 'Cracking' : 'OK'}</span>
            <span class="dr">{s.detail}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Chart({ ctl }: Ctl) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { ctl.chartCanvas = ref.current; }, [ctl]);
  return (
    <section id="chartWrap" class="card" aria-label="Live chart">
      <div class="legend"><span><i style="background:var(--amber)" />Table accel (g)</span><span><i style="background:var(--cyan)" />Roof swing (cm)</span></div>
      <canvas id="chart" ref={ref} aria-hidden="true" />
    </section>
  );
}

function ReplayBar({ ctl }: Ctl) {
  if (!ui.replayOn.value) return null;
  return (
    <div id="replaybar" class="card" role="group" aria-label="Replay controls">
      <b>Replay</b>
      <button type="button" class="btn" id="rpPlay" onClick={() => ctl.setReplayPlaying(!ui.replayPlaying.value)}>{ui.replayPlaying.value ? 'Pause' : 'Play'}</button>
      <input type="range" id="rpScrub" min="0" max="1" step="0.001" value={ui.replayPos.value} aria-label="Replay position" onInput={(e) => ctl.seekReplay(+e.currentTarget.value)} />
      <Seg id="segSpeed" label="Replay speed" value={ui.replaySpeed.value} onPick={(v) => ctl.setReplaySpeed(v)} options={[[0.25, '0.25x'], [0.5, '0.5x'], [1, '1x']]} />
      <button type="button" class="btn" id="rpExit" onClick={() => ctl.exitReplay()}>Live</button>
    </div>
  );
}

function GuidePanel({ ctl }: Ctl) {
  const i = ui.stop.value;
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (i !== null) titleRef.current?.focus(); }, [i]);
  if (i === null) return null;
  const s = STOPS[i]!;
  return (
    <aside class="panel card" id="panel" aria-labelledby="pTitle">
      <button type="button" class="close" id="pClose" aria-label="Close guide" onClick={() => (ui.stop.value = null)}>&times;</button>
      <div class="tags" id="pTags">
        {s.tags.map((t) => <span class={`tag ${t}`}>{TAG_NAMES[t]}</span>)}
        <span class="step">Test {i + 1} of {STOPS.length}</span>
      </div>
      <h2 id="pTitle" tabIndex={-1} ref={titleRef}>{s.title}</h2>
      <div id="pBody" dangerouslySetInnerHTML={{ __html: s.body }} />
      <p class="notice" id="pNotice">Notice: {s.notice}</p>
      <div class="row">
        <button type="button" class="btn primary" id="pRun" onClick={() => ctl.runStop()}>Run this test</button>
        <button type="button" class="btn" id="pPrev" disabled={i === 0} onClick={() => ctl.showStop(i - 1)}>Back</button>
        <button type="button" class="btn" id="pNext" disabled={i === STOPS.length - 1} onClick={() => ctl.showStop(i + 1)}>Next</button>
      </div>
    </aside>
  );
}

/** A native modal dialog: showModal() traps focus and makes the rest of the page inert. */
function Dialog(p: { name: 'intro' | 'text' | 'about'; labelledBy: string; closable?: boolean; children: preact.ComponentChildren }) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = ui.dialog.value === p.name;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} class="modal" id={`${p.name}M`} aria-labelledby={p.labelledBy}
      onClose={() => { if (ui.dialog.value === p.name) ui.dialog.value = null; }}
      onClick={(e) => { if (e.target === ref.current) ui.dialog.value = null; }}>
      {p.closable !== false && <button type="button" class="close" data-close aria-label="Close" onClick={() => (ui.dialog.value = null)}>&times;</button>}
      {p.children}
    </dialog>
  );
}

function Dialogs({ ctl }: Ctl) {
  return (
    <>
      <Dialog name="intro" labelledBy="introT" closable={false}>
        <h1 id="introT">Shake Table Lab</h1>
        <p>Engineers find out how a building fails by shaking it on a giant steel table before a real earthquake does. Here you run the table.</p>
        <p>Pick a building, pick the shaking, then press <b>Shake</b>. Watch the instruments, ride along inside, and replay any collapse in slow motion.</p>
        <div class="legendT">
          <div><span class="tag real">Real world</span> facts about real labs and real buildings</div>
          <div><span class="tag model">Model</span> what this simulation shows, with simplified physics</div>
        </div>
        <p>Everything is a button. Drag to look around in Orbit view and scroll to zoom.</p>
        <div class="dialog-row">
          <button type="button" class="btn primary" id="introGuide" onClick={() => { ui.dialog.value = null; ctl.synth.init(); ctl.showStop(0); }}>Guide me through 6 tests</button>
          <button type="button" class="btn" id="introFree" onClick={() => { ui.dialog.value = null; ctl.synth.init(); }}>Explore on my own</button>
        </div>
      </Dialog>
      <Dialog name="text" labelledBy="textT">
        <h1 id="textT">Text version</h1>
        <div id="textBody">
          {STOPS.map((s, i) => (
            <>
              <h2>Test {i + 1}. {s.title}</h2>
              <p><b>{s.tags.map((t) => TAG_NAMES[t]).join(' and ')}</b></p>
              <div dangerouslySetInnerHTML={{ __html: s.body }} />
              <p><b>Notice:</b> {s.notice}</p>
            </>
          ))}
        </div>
      </Dialog>
      <Dialog name="about" labelledBy="aboutT">
        <h1 id="aboutT">About this lab</h1>
        <h2>What is simplified</h2>
        <p>The building is a shear-building model. Each floor is one heavy concrete slab of 4,000 kg. Each story acts like a spring with damping between two slabs. When a story bends past its drift limit, its columns break into real physics pieces and the floors above fall.</p>
        <p>The numbers are tuned to make the ideas clear. The bare frame has a natural beat near 1.2 Hz, the braced frame near 2.9 Hz, and the isolated building near 0.4 Hz on its bearings. Real tests record hundreds of sensors and are designed by engineers. Nothing here is a design tool.</p>
        <p>Quake mode uses a synthetic earthquake built from many waves. It is not a recording of a real earthquake.</p>
        <h2>Sources for the Real world tags</h2>
        <ul>
          <li><a href="https://guinnessworldrecords.com/world-records/largest-3d-earthquake-shake-table" target="_blank" rel="noopener">Guinness World Records: Largest 3D earthquake shake table (E-Defense, 20 m by 15 m, 1,200 tonnes)</a></li>
          <li><a href="https://www.earthmagazine.org/article/faking-quakes-full-scale-giant-shake-tables-simulate-earthquakes-make-buildings-safer" target="_blank" rel="noopener">EARTH Magazine: Faking quakes at full scale (2009 seven-story wood building test)</a></li>
          <li>Taghavi, S. and Miranda, E. (2003). Response Assessment of Nonstructural Building Elements. PEER Report 2003/05.</li>
          <li>San Francisco City Hall base isolation retrofit after the 1989 Loma Prieta earthquake. Needs a primary source before students see it.</li>
        </ul>
        <h2>Credits</h2>
        <p>Lab halls, textures and props: Poly Haven (CC0).</p>
        <ul id="credits">
          {ui.credits.value.map((c) => <li>{c.name} ({c.type}) by {c.authors.join(' and ')}</li>)}
        </ul>
        <p>3D: three.js r181. Physics: Rapier 0.21. No tracking, no cookies, no login.</p>
      </Dialog>
    </>
  );
}

function Loader() {
  if (!ui.loading.value) return null;
  return (
    <div id="loader" role="status" aria-live="polite">
      <div><b>SHAKE TABLE LAB</b><div class="bar2"><i id="loadBar" style={{ width: `${ui.loadProgress.value}%` }} /></div><small id="loadMsg">{ui.loadMsg.value}</small></div>
    </div>
  );
}

export function App({ ctl }: Ctl) {
  return (
    <>
      {ui.camTag.value && <div id="camtag"><span class="rec" />{ui.camTag.value}</div>}
      {ui.toast.value && <div id="toast">{ui.toast.value}</div>}
      {ui.behind.value && <div class="behind" role="status">Running slower than real time on this device</div>}
      <Header ctl={ctl} />
      <ControlRoom ctl={ctl} />
      <Instruments />
      <Chart ctl={ctl} />
      <ReplayBar ctl={ctl} />
      <GuidePanel ctl={ctl} />
      <Dialogs ctl={ctl} />
      <Loader />
    </>
  );
}
