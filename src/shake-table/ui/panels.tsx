/** The guided lab panel, notebook, instructor and help pages, camera controls and effects. */
import { useEffect, useRef } from 'preact/hooks';
import { attemptLevel, bestDesign, describeResult } from '../notebook.ts';
import { LEVELS, type LevelId } from '../specimen/design.ts';
import { OBJECTIVES, POE, POE_STEPS } from '../pedagogy.ts';
import { STOPS, TAG_NAMES } from '../tour.ts';
import { STOP_FIGURES } from '../concept-figures.ts';
import { figureHtml } from '../figure.ts';
import { TIERS } from '../../core/render/quality.ts';
import { Dialog, Seg, type Ctl } from './app.tsx';
import { ui } from './store.ts';

// ------------------------------------------------------------------ guided lab

export function GuidePanel({ ctl }: Ctl) {
  const i = ui.stop.value;
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (i !== null) titleRef.current?.focus(); }, [i]);
  if (i === null) return null;
  const s = STOPS[i]!, p = POE[i]!, entry = ui.notebook.value.tests[i]!;
  const stage = ui.poeStage.value;
  return (
    <aside class="panel card" id="panel" aria-labelledby="pTitle">
      <button type="button" class="close" id="pClose" aria-label="Close the guided lab" onClick={() => ctl.explore()}>&times;</button>
      <div class="tags" id="pTags">
        {s.tags.map((t) => <span class={`tag ${t}`}>{TAG_NAMES[t]}</span>)}
        <span class="step">Test {i + 1} of {STOPS.length}</span>
      </div>
      <ol class="dots" aria-label="Your progress">
        {STOPS.map((_, k) => (
          <li><button type="button" class={`dot${k === i ? ' here' : ''}${ui.notebook.value.tests[k]!.result ? ' done' : ''}`} aria-label={`Test ${k + 1}${ui.notebook.value.tests[k]!.result ? ', done' : ''}`} aria-current={k === i ? 'step' : undefined} onClick={() => ctl.showStop(k)} /></li>
        ))}
      </ol>
      <h2 id="pTitle" tabIndex={-1} ref={titleRef}>{s.title}</h2>
      <p class="objective"><b>You will be able to:</b> {p.objective}</p>
      <ol class="poe" aria-label="Lab steps">
        {POE_STEPS.map((name, k) => (
          <li><button type="button" class={`poestep${k === stage ? ' here' : ''}${k < stage ? ' past' : ''}`} aria-current={k === stage ? 'step' : undefined} onClick={() => ctl.setPoeStage(k)}>{k + 1}. {name}</button></li>
        ))}
      </ol>

      {stage === 0 && (
        <div class="stage" id="stagePredict">
          <div id="pBody" dangerouslySetInnerHTML={{ __html: s.body }} />
          <div id="pFigure" dangerouslySetInnerHTML={{ __html: figureHtml(STOP_FIGURES[i]!.setup) }} />
          <fieldset class="predict">
            <legend>{p.predict.question}</legend>
            {p.predict.options.map((o, k) => (
              <label class={`option${entry.prediction === k ? ' picked' : ''}`}>
                <input type="radio" name={`predict${i}`} checked={entry.prediction === k} onChange={() => ctl.setPrediction(i, k)} />
                {o}
              </label>
            ))}
          </fieldset>
          <div class="row">
            <button type="button" class="btn primary" id="toTest" disabled={entry.prediction === null} onClick={() => ctl.setPoeStage(1)}>{entry.prediction === null ? 'Make a prediction first' : 'Next: run the test'}</button>
          </div>
        </div>
      )}

      {stage === 1 && (
        <div class="stage" id="stageTest">
          <p>The test sets up the building and the shaking for you. Watch the building and the instruments.</p>
          <p class="notice" id="pNotice">Notice: {s.notice}</p>
          <div class="row">
            <button type="button" class="btn primary big" id="pRun" onClick={() => ctl.runStop()}>{ui.tableLive.value ? 'Test running' : entry.result ? 'Run it again' : 'Run this test'}</button>
            {entry.result && <button type="button" class="btn" onClick={() => ctl.setPoeStage(2)}>See what happened</button>}
          </div>
        </div>
      )}

      {stage === 2 && (
        <div class="stage" id="stageObserve">
          {entry.result ? (
            <>
              <h3>What the instruments measured</h3>
              <ul class="data">{describeResult(entry.result).map((l) => <li>{l}</li>)}</ul>
              {entry.prediction !== null && (
                <p class={`feedback ${entry.prediction === p.predict.answer ? 'match' : 'differ'}`}>
                  <b>{entry.prediction === p.predict.answer ? 'Your prediction matches the model.' : 'Your prediction differs from the model.'}</b>{' '}
                  You predicted: {p.predict.options[entry.prediction]}. {p.predict.why}
                </p>
              )}
              <p class="hint">Compare what you saw with the diagram. Which label matches each thing you measured?</p>
              <div id="oFigure" dangerouslySetInnerHTML={{ __html: figureHtml(STOP_FIGURES[i]!.result) }} />
              <p class="hint">Tip: press Replay to watch it again at 0.25x. In replay the chart shows the whole test with failures in red. Drag on it to jump to any moment.</p>
              <div class="row"><button type="button" class="btn primary" onClick={() => ctl.setPoeStage(3)}>Next: explain it</button></div>
            </>
          ) : (
            <>
              <p>Run the test first. Its results land here and in your notebook.</p>
              <div class="row"><button type="button" class="btn primary" onClick={() => ctl.setPoeStage(1)}>Back to the test</button></div>
            </>
          )}
        </div>
      )}

      {stage === 3 && (
        <div class="stage" id="stageExplain">
          <details class="figrecall">
            <summary>Show the diagrams again</summary>
            <div dangerouslySetInnerHTML={{ __html: figureHtml(STOP_FIGURES[i]!.setup) + figureHtml(STOP_FIGURES[i]!.result) }} />
          </details>
          <label class="lbl" for={`explain${i}`}>{p.explain}</label>
          <textarea id={`explain${i}`} rows={6} value={entry.explanation} placeholder={'Claim: what happened?\nEvidence: which numbers or observations show it?\nReasoning: what science explains it?'}
            onInput={(e) => ctl.setExplanation(i, e.currentTarget.value)} />
          <p class="hint">Saved to your notebook as you type.</p>
          <div class="row">
            {i < STOPS.length - 1
              ? <button type="button" class="btn primary" id="pNext" onClick={() => ctl.showStop(i + 1)}>Next test</button>
              : <button type="button" class="btn primary" onClick={() => ctl.openDialog('notebook')}>Finish: open my notebook</button>}
          </div>
        </div>
      )}

      <div class="row foot">
        <button type="button" class="btn" id="pPrev" disabled={i === 0} onClick={() => ctl.showStop(i - 1)}>Previous test</button>
        <button type="button" class="btn" id="pNextTest" disabled={i === STOPS.length - 1} onClick={() => ctl.showStop(i + 1)}>Skip to next test</button>
      </div>
    </aside>
  );
}

// ------------------------------------------------------------------ notebook

export function NotebookDialog({ ctl }: Ctl) {
  const n = ui.notebook.value;
  return (
    <Dialog name="notebook" labelledBy="nbT" wide>
      <h1 id="nbT">Lab notebook</h1>
      <p>Your predictions, the measured results and your explanations. They stay in this browser until you download them.</p>
      <div class="row"><button type="button" class="btn primary" id="downloadReportTop" onClick={() => ctl.downloadReport()}>Download lab report</button></div>
      <label class="lbl" for="student">Your name (for the report)</label>
      <input id="student" class="text" value={n.student} onInput={(e) => ctl.setStudent(e.currentTarget.value)} />
      {STOPS.map((s, i) => {
        const t = n.tests[i]!, p = POE[i]!;
        return (
          <section class="nbtest">
            <h2>Test {i + 1}. {s.title} {t.result && <span class="pill ok">Done</span>}</h2>
            <p><b>Prediction:</b> {t.prediction === null ? 'not made yet' : p.predict.options[t.prediction]}</p>
            {t.result ? <ul class="data">{describeResult(t.result).map((l) => <li>{l}</li>)}</ul> : <p class="hint">Not run yet.</p>}
            <p><b>Explanation:</b> {t.explanation || <span class="hint">not written yet</span>}</p>
          </section>
        );
      })}
      {n.designs.length > 0 && (
        <section class="nbtest" id="nbDesigns">
          <h2>Design challenge</h2>
          {([1, 2] as LevelId[]).map((level) => {
            const tries = n.designs.filter((a) => attemptLevel(a) === level), best = bestDesign(n, level);
            if (!tries.length) return null;
            return (
              <>
                <h3>Level {level}. {LEVELS[level].title}</h3>
                <p><b>Best design:</b> {best ? `${best.name}, ${best.cost} credits` : 'none survived within the budget yet'}</p>
                <table class="runs">
                  <thead><tr><th>Design</th><th>Cost</th><th>Predicted</th><th>Result</th><th>Largest drift</th><th>Lasting lean</th></tr></thead>
                  <tbody>{tries.map((a) => <tr><td>{a.name}</td><td>{a.cost}</td><td>{a.prediction ?? 'none'}</td><td>{a.survived ? 'survived' : a.failure}</td><td>{a.maxDriftPct.toFixed(1)}%</td><td>{a.survived && a.residualPct !== undefined ? `${a.residualPct.toFixed(1)}%` : ''}</td></tr>)}</tbody>
                </table>
              </>
            );
          })}
          {n.designExplanation && <p class="ans">{n.designExplanation}</p>}
        </section>
      )}
      {n.explore.length > 0 && (
        <section class="nbtest">
          <h2>Free exploration runs</h2>
          <table class="runs">
            <thead><tr><th>Building</th><th>Shaking</th><th>Roof swing</th><th>Failure</th></tr></thead>
            <tbody>{n.explore.map((r) => <tr><td>{r.building}</td><td>{r.shaking} {r.strength.toFixed(2)} g{r.frequency ? ` ${r.frequency.toFixed(2)} Hz` : ''}</td><td>{r.peakRoofCm.toFixed(0)} cm</td><td>{r.failure || 'none'}</td></tr>)}</tbody>
          </table>
        </section>
      )}
      <div class="row">
        <button type="button" class="btn primary" id="downloadReport" onClick={() => ctl.downloadReport()}>Download lab report</button>
        <button type="button" class="btn" onClick={() => { if (confirm('Clear the whole notebook?')) ctl.clearNotebook(); }}>Clear notebook</button>
      </div>
      <p class="hint">The report is a web page. Open it and print it to PDF, or upload it to your course.</p>
    </Dialog>
  );
}

// ------------------------------------------------------------------ instructors

export function InstructorsDialog({ ctl }: Ctl) {
  return (
    <Dialog name="instructors" labelledBy="teachT" wide>
      <h1 id="teachT">For instructors: an online science lab</h1>
      <p class="lead">The Shake Table Lab is a virtual lab for an online science course. Students run real experiments on a simulated full-size shake table, collect data, and explain what they see. It runs in any modern browser, including school Chromebooks, with no installs, accounts or tracking.</p>

      <h2>Learning objectives</h2>
      <table class="runs">
        <thead><tr><th>Objective</th><th>Guided tests</th></tr></thead>
        <tbody>
          {OBJECTIVES.map((o) => (
            <tr><td><b>{o.id}</b> {o.text}</td><td>{POE.map((p, i) => (p.objectiveIds.includes(o.id) ? i + 1 : null)).filter((x) => x !== null).join(', ')}</td></tr>
          ))}
        </tbody>
      </table>

      <h2>Teaching model</h2>
      <p>Every guided test follows the same four steps, shown at the top of the lab panel:</p>
      <ol class="model">
        <li><b>Predict.</b> Students commit to a prediction before they see anything. This surfaces their ideas about forces and motion.</li>
        <li><b>Test.</b> One button sets up the building and the shaking, so the test is the same for every student.</li>
        <li><b>Observe.</b> The lab records the measurements and compares them with the prediction, with a short science explanation.</li>
        <li><b>Explain.</b> Students write a claim, the evidence for it and their reasoning (claim, evidence, reasoning).</li>
      </ol>
      <p><b>Words and pictures together.</b> Every idea is given twice, following dual coding theory (Paivio): once in words and once as a labeled diagram that uses the same words, such as a response curve that peaks at the natural beat. Students who hold an idea both as words and as an image remember and use it better than with either alone. In Predict a setup diagram sits beside the reading. It pictures the idea but not the outcome, so it does not give the prediction away. In Observe a result diagram sits next to the measured results and the science explanation. Both can be reopened while students write their explanation. Each design hint has its own diagram too. The text version and the lab report include every diagram with a written description.</p>
      <p>The six tests build on each other: what a shake table does, resonance, why frequency matters as much as strength, stiffness, base isolation, and finally nonstructural hazards. Each fact is tagged <span class="tag real">Real world</span> or <span class="tag model">Model</span>, so students also learn what a scientific model can and cannot tell them.</p>

      <h2>Design challenge</h2>
      <p>After the guided tests, students apply what they learned as engineers do. In level 1 they design a three-story building for 600 credits that must survive a 0.4 g quake. In level 2 they design a five-story tower for 1000 credits that must survive a stronger, slower quake with no story drifting more than 2.5%, so standing is not enough. They choose a light, heavy or braced frame for each story, add dampers or base isolation, predict, test and improve. Each failure unlocks an engineering hint. Every attempt goes into the notebook with its cost, prediction, result, largest drift and any lasting lean, so the report shows the design process and not only the final answer.</p>
      <p>It rewards understanding over guessing. The cheapest designs that survive avoid a weak story above a strong one, and the one-click answer, base isolation, is over budget. Good discussion prompts: why did a braced ground story make things worse, and when are dampers worth their cost?</p>

      <h2>Running it in an online course</h2>
      <ol class="model">
        <li>Link the lab from a Canvas page or module. A link opens it in a new tab with the most screen space.</li>
        <li>Students complete the six guided tests, about 30 minutes.</li>
        <li>They download the lab report from the notebook and upload it to a Canvas assignment.</li>
        <li>Follow up with a discussion: which design would you choose for a school, and why?</li>
      </ol>
      <p>To assign one test, link straight to it, for example <code>#stop=2</code> for resonance. Add <code>&amp;run</code> to start it right away.</p>

      <h2>Assessing the report</h2>
      <table class="runs">
        <thead><tr><th>Criterion</th><th>Strong</th><th>Developing</th></tr></thead>
        <tbody>
          <tr><td>Prediction</td><td>Made before testing, with a reason</td><td>Missing or changed after the test</td></tr>
          <tr><td>Evidence</td><td>Cites measured numbers, such as roof swing or failure frequency</td><td>Describes what it looked like only</td></tr>
          <tr><td>Reasoning</td><td>Links the evidence to resonance, stiffness or isolation</td><td>Restates the result</td></tr>
        </tbody>
      </table>

      <h2>Access and technology</h2>
      <ul>
        <li>Works with the keyboard alone. Press the question mark key for shortcuts.</li>
        <li>A text version of every test. Cracks and failures always show on screen as well as in sound, so sound is never required. Calmer motion when the device asks for reduced motion.</li>
        <li>Dramatic effects and sound can be switched off in Help.</li>
        <li>No accounts, cookies or analytics. Notebooks stay on the student's device until they download them.</li>
      </ul>
      <div class="row">
        <button type="button" class="btn primary" onClick={() => { ctl.openDialog(null); ctl.showStop(0); }}>Try the guided lab</button>
        <button type="button" class="btn" onClick={() => ctl.openDialog('text')}>Read the text version</button>
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ help

const SHORTCUTS: [string, string][] = [
  ['Space', 'Shake or stop'],
  ['R', 'Reset the building'],
  ['1, 2, 3', 'Bare frame, braced, isolated'],
  ['Arrow keys', 'Turn and zoom the camera'],
  ['0', 'Reset the view'],
  ['C', 'Next camera'],
  ['S', 'Stress colors on or off'],
  ['M', 'Slow motion'],
  ['P', 'Replay'],
  ['G', 'Guided lab'],
  ['N', 'Notebook'],
  ['F', 'Full screen'],
  ['?', 'This help'],
];

export function HelpDialog({ ctl }: Ctl) {
  return (
    <Dialog name="help" labelledBy="helpT">
      <h1 id="helpT">Help</h1>
      <h2>Getting around</h2>
      <p><b>Guided lab</b> walks you through six tests. <b>Explore</b> gives you every control. Your results always go to the <b>Notebook</b>.</p>
      <p>Drag to turn the view, scroll or pinch to zoom, or use the camera buttons at the bottom right.</p>
      <p><b>Replay</b> plays the last 40 s again in slow motion. The chart then shows the whole test, with each failure marked in red. Drag on the chart to jump to any moment, and the instruments show what they measured then.</p>
      <h2>Keyboard shortcuts</h2>
      <button type="button" class="btn" id="shortcutsBtn" aria-pressed={ui.shortcuts.value} onClick={() => ctl.setShortcuts(!ui.shortcuts.value)}>Single-key shortcuts {ui.shortcuts.value ? 'on' : 'off'}</button>
      <p class="hint">Turn these off if you use speech input or a screen reader that sends letter keys.</p>
      <table class="runs keys"><tbody>{SHORTCUTS.map(([k, v]) => <tr><td><kbd>{k}</kbd></td><td>{v}</td></tr>)}</tbody></table>
      <h2>Settings</h2>
      <div class="lbl">Graphics quality (physics is the same at every level)</div>
      <Seg id="segQuality" label="Graphics quality" value={ui.quality.value} onPick={(v) => void ctl.setQuality(v)}
        options={[['auto', `Auto (${TIERS[ui.tier.value].label})`], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]} />
      <div class="row">
        <button type="button" class="btn" id="dramaBtn" aria-pressed={ui.drama.value} onClick={() => ctl.setDrama(!ui.drama.value)}>Dramatic effects {ui.drama.value ? 'on' : 'off'}</button>
        <button type="button" class="btn" aria-pressed={ui.sound.value} onClick={() => ctl.setSound(!ui.sound.value)}>Sound {ui.sound.value ? 'on' : 'off'}</button>
      </div>
      <h2>More</h2>
      <div class="row">
        <button type="button" class="btn" id="textBtn" onClick={() => ctl.openDialog('text')}>Text version</button>
        <button type="button" class="btn" id="aboutBtn" onClick={() => ctl.openDialog('about')}>About and sources</button>
        <button type="button" class="btn" onClick={() => ctl.openDialog('intro')}>Start screen</button>
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ view controls and effects

export function CameraControls({ ctl }: Ctl) {
  return (
    <div class="camctl card" role="group" aria-label="Camera controls">
      <button type="button" class="btn" aria-label="Turn left" title="Turn left" onClick={() => ctl.orbit(0.3)}>&#8634;</button>
      <button type="button" class="btn" aria-label="Turn right" title="Turn right" onClick={() => ctl.orbit(-0.3)}>&#8635;</button>
      <button type="button" class="btn" aria-label="Zoom in" title="Zoom in" onClick={() => ctl.zoom(0.8)}>+</button>
      <button type="button" class="btn" aria-label="Zoom out" title="Zoom out" onClick={() => ctl.zoom(1.25)}>&minus;</button>
      <button type="button" class="btn" aria-label="Reset view" title="Reset view" onClick={() => ctl.resetView()}>Reset view</button>
    </div>
  );
}

export function CollapseBanner() {
  const b = ui.banner.value;
  if (!b) return null;
  return (
    <div class={`banner${b.title === 'COLLAPSE' ? ' alarm' : ''}`} role="alert">
      <b>{b.title}</b>
      <span>{b.detail}</span>
    </div>
  );
}

/** The prototype's stress colors: green when a story barely bends, through yellow, to red at its breaking drift. */
export function StressLegend() {
  return (
    <div class="stresslegend" aria-label="Stress colors: green is safe, yellow is bending hard, red is about to break">
      <div class="ramp" />
      <div class="ends"><span>Safe</span><span>Bending hard</span><span>Breaking</span></div>
    </div>
  );
}
