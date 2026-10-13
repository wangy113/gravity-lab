/** The lab's UI. Element ids from the prototype are kept for tests. */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { Controller } from '../controller.ts';
import { STOPS, TAG_NAMES } from '../tour.ts';
import { CameraControls, CollapseBanner, GuidePanel, HelpDialog, InstructorsDialog, NotebookDialog, StressLegend } from './panels.tsx';
import { ui, type DialogName } from './store.ts';

export type Ctl = { ctl: Controller };

export function Seg<T extends string | number>(p: { id: string; label: string; value: T; options: [T, string][]; onPick: (v: T) => void }) {
  return (
    <div class="seg" id={p.id} role="group" aria-label={p.label}>
      {p.options.map(([v, text]) => (
        <button type="button" data-v={String(v)} aria-pressed={p.value === v} onClick={() => p.onPick(v)}>{text}</button>
      ))}
    </div>
  );
}

function Header({ ctl }: Ctl) {
  const done = ui.notebook.value.tests.filter((t) => t.result).length;
  const guided = ui.stop.value !== null;
  return (
    <header class="bar">
      <div class="title card">
        <b>Shake Table Lab</b>
        <small>A virtual earthquake engineering lab</small>
      </div>
      {ui.tableLive.value && <div class="live" role="status"><i />TABLE LIVE</div>}
      <div class="spacer" />
      <nav class="nav card" aria-label="Lab sections">
        <button type="button" class="navbtn" id="guideBtn" aria-pressed={guided} onClick={() => ctl.showStop(ui.stop.value ?? 0)}>Guided lab</button>
        <button type="button" class="navbtn" id="exploreBtn" aria-pressed={!guided} onClick={() => ctl.explore()}>Explore</button>
        <button type="button" class="navbtn" id="notebookBtn" onClick={() => ctl.openDialog('notebook')}>Notebook <span class="badge">{done}/{STOPS.length}</span></button>
        <button type="button" class="navbtn" id="teachBtn" onClick={() => ctl.openDialog('instructors')}>For instructors</button>
        <button type="button" class="navbtn" id="helpBtn" onClick={() => ctl.openDialog('help')}>Help</button>
      </nav>
      <button type="button" class="btn" id="soundBtn" aria-pressed={ui.sound.value} onClick={() => ctl.setSound(!ui.sound.value)}>{ui.sound.value ? 'Sound on' : 'Sound off'}</button>
      <button type="button" class="btn" id="fullBtn" onClick={() => ctl.toggleFullscreen()}>Full screen</button>
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
      {ui.stress.value && <StressLegend />}
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
      <button type="button" class="btn primary" id="rpExit" onClick={() => ctl.exitReplay()}>Live</button>
    </div>
  );
}

/** A native modal dialog: showModal() traps focus and makes the rest of the page inert. */
export function Dialog(p: { name: DialogName; labelledBy: string; closable?: boolean; wide?: boolean; children: ComponentChildren }) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = ui.dialog.value === p.name;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} class={`modal${p.wide ? ' wide' : ''}`} id={`${p.name}M`} aria-labelledby={p.labelledBy}
      onClose={() => { if (ui.dialog.value === p.name) ui.dialog.value = null; }}
      onClick={(e) => { if (e.target === ref.current) ui.dialog.value = null; }}>
      {p.closable !== false && <button type="button" class="close" data-close aria-label="Close" onClick={() => (ui.dialog.value = null)}>&times;</button>}
      {open && p.children}
    </dialog>
  );
}

function IntroDialog({ ctl }: Ctl) {
  const go = (fn: () => void) => () => { ui.dialog.value = null; ctl.synth.init(); fn(); };
  return (
    <Dialog name="intro" labelledBy="introT" closable={false}>
      <h1 id="introT">Shake Table Lab</h1>
      <p>Engineers find out how a building fails by shaking it on a giant steel table before a real earthquake does. Here you run the table.</p>
      <div class="choices">
        <button type="button" class="choice primary" id="introGuide" onClick={go(() => ctl.showStop(0))}>
          <b>Start the guided lab</b><span>6 short tests, about 30 minutes. For each one you predict, test, observe and explain.</span>
        </button>
        <button type="button" class="choice" id="introFree" onClick={go(() => ctl.explore())}>
          <b>Explore on my own</b><span>Every control, no steps. Your runs still go to the notebook.</span>
        </button>
        <button type="button" class="choice" id="introTeach" onClick={go(() => ctl.openDialog('instructors'))}>
          <b>For instructors</b><span>How this works as an online science lab: objectives, teaching model and assessment.</span>
        </button>
      </div>
      <div class="legendT">
        <div><span class="tag real">Real world</span> facts about real labs and real buildings</div>
        <div><span class="tag model">Model</span> what this simulation shows, with simplified physics</div>
      </div>
      <p class="hint">Drag to look around and scroll to zoom. Press the question mark key for keyboard shortcuts.</p>
    </Dialog>
  );
}

function Dialogs({ ctl }: Ctl) {
  return (
    <>
      <IntroDialog ctl={ctl} />
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
      <HelpDialog ctl={ctl} />
      <NotebookDialog ctl={ctl} />
      <InstructorsDialog ctl={ctl} />
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
      {ui.toast.value && <div id="toast" role="status">{ui.toast.value}</div>}
      {ui.behind.value && <div class="behind" role="status">Running slower than real time on this device</div>}
      <CollapseBanner />
      <Header ctl={ctl} />
      {/* Guided lab: the lesson panel replaces the control room, because each test sets itself up. */}
      <div class={`leftcol${ui.stop.value !== null ? ' guided' : ''}`}>
        {ui.stop.value !== null ? <GuidePanel ctl={ctl} /> : <><ControlRoom ctl={ctl} /><Chart ctl={ctl} /></>}
      </div>
      <div class="rightcol">
        <Instruments />
        {ui.stop.value !== null && <Chart ctl={ctl} />}
      </div>
      <CameraControls ctl={ctl} />
      <ReplayBar ctl={ctl} />
      <Dialogs ctl={ctl} />
      <Loader />
    </>
  );
}
