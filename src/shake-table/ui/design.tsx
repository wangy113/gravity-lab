/** The design challenge: build your own three-story building, predict, test it against a quake, improve. */
import { useEffect, useRef } from 'preact/hooks';
import { bestDesign } from '../notebook.ts';
import { compileSpecimen, SpecimenError } from '../specimen/compile.ts';
import { CHALLENGE, DAMPER, designCost, designSpec, FRAMES, ISOLATION, type FrameChoice } from '../specimen/design.ts';
import { Seg, type Ctl } from './app.tsx';
import { ui } from './store.ts';

/** Ideas students unlock by failing, all about this model. */
const HINTS = [
  'A building fails where it is weakest. If one story is much weaker than the one below it, the bending piles up there. Engineers call it a soft story.',
  'A stiffer frame moves less for the same shaking. It also has a faster natural beat, which moves it away from the slow swings of this quake.',
  'Dampers soak up energy like shock absorbers. They help most on a story that is close to failing, but they cannot save a frame that is far too weak.',
  'Base isolation lets the ground move under the building. It works very well here, but it is the most expensive choice.',
];

export function DesignPanel({ ctl }: Ctl) {
  const d = ui.draft.value, n = ui.notebook.value;
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, []);
  const cost = designCost(d), over = cost > CHALLENGE.budget;
  let beat = '', problem = '';
  try { beat = `${compileSpecimen(designSpec(d)).modes[0]!.toFixed(2)} Hz`; } catch (e) { problem = e instanceof SpecimenError ? e.message : String(e); }
  const last = n.designs.at(-1), best = bestDesign(n);
  const failures = n.designs.filter((a) => !a.survived).length;
  const pred = ui.designPrediction.value;
  const running = ui.tableLive.value;

  return (
    <aside class="panel card" id="designPanel" aria-labelledby="dTitle">
      <button type="button" class="close" aria-label="Close the design challenge" onClick={() => ctl.explore()}>&times;</button>
      <div class="tags"><span class="tag model">Model</span><span class="step">Design challenge</span></div>
      <h2 id="dTitle" tabIndex={-1} ref={titleRef}>Design a building that survives</h2>
      <p class="objective"><b>Goal:</b> your building must survive a {CHALLENGE.g} g quake and cost {CHALLENGE.budget} credits or less. Cheaper is better.</p>

      <h3 class="dh">1. Choose each story</h3>
      <div class="stories">
        {[2, 1, 0].map((i) => (
          <div class="story-row">
            <div class="lbl">Story {i + 1}{i === 0 ? ' (ground)' : i === 2 ? ' (top)' : ''}</div>
            <Seg id={`segStory${i + 1}`} label={`Story ${i + 1} frame`} value={d.frames[i]!}
              onPick={(v: FrameChoice) => ctl.editDraft((x) => { x.frames[i] = v; })}
              options={(Object.keys(FRAMES) as FrameChoice[]).map((k) => [k, `${FRAMES[k].label.split(' ')[0]} ${FRAMES[k].cost}`])} />
            <label class="check"><input type="checkbox" id={`damp${i + 1}`} checked={d.dampers[i]} onChange={(e) => { const on = e.currentTarget.checked; ctl.editDraft((x) => { x.dampers[i] = on; }); }} /> {DAMPER.label} +{DAMPER.cost}</label>
          </div>
        ))}
        <label class="check base"><input type="checkbox" id="isoBox" checked={d.isolated} onChange={(e) => { const on = e.currentTarget.checked; ctl.editDraft((x) => { x.isolated = on; }); }} /> {ISOLATION.label} under the building +{ISOLATION.cost}</label>
      </div>

      <div class={`budget${over ? ' over' : ''}`}>
        <div class="budget-line"><span>Cost</span><b id="dCost">{cost} of {CHALLENGE.budget} credits</b></div>
        <div class="meter" role="meter" aria-label="Cost against the budget" aria-valuemin={0} aria-valuemax={CHALLENGE.budget} aria-valuenow={cost} aria-valuetext={`${cost} of ${CHALLENGE.budget} credits${over ? ', over budget' : ''}`}>
          <i style={{ width: `${Math.min(100, (100 * cost) / CHALLENGE.budget)}%` }} />
        </div>
        {over && <p class="hint">Over budget. You can still test it, but it does not count for the challenge.</p>}
        <p class="hint">Natural beat (model): <b>{beat || 'not available'}</b>. The quake shakes hardest below about 1.5 Hz.</p>
        {problem && <p class="feedback differ" role="status">{problem}</p>}
      </div>

      <h3 class="dh">2. Predict</h3>
      <fieldset class="predict">
        <legend>Will your building survive the {CHALLENGE.g} g quake?</legend>
        {(['survive', 'collapse'] as const).map((v) => (
          <label class={`option${pred === v ? ' picked' : ''}`}>
            <input type="radio" name="designPredict" checked={pred === v} onChange={() => (ui.designPrediction.value = v)} />
            {v === 'survive' ? 'It will survive' : 'It will collapse'}
          </label>
        ))}
      </fieldset>

      <h3 class="dh">3. Test</h3>
      <button type="button" class="btn primary big" id="dTest" disabled={!pred || running || !!problem} onClick={() => ctl.testDesign()}>
        {running ? 'Test running' : pred ? `Shake it at ${CHALLENGE.g} g` : 'Make a prediction first'}
      </button>

      {last && (
        <div class="stage" id="dResult">
          <h3 class="dh">4. Observe</h3>
          <p class={`feedback ${last.survived ? 'match' : 'differ'}`}>
            <b>{last.survived ? `Survived. ${last.cost} credits.` : `Collapsed. ${last.failure}.`}</b>{' '}
            Largest story drift: {last.maxDriftPct.toFixed(1)}%.{' '}
            {last.prediction && (last.prediction === (last.survived ? 'survive' : 'collapse') ? 'Your prediction was right.' : 'Your prediction was wrong. What surprised you?')}
            {last.survived && last.cost > CHALLENGE.budget && ' It is over budget, so try a cheaper design.'}
          </p>
          <p id="dBest"><b>Best design so far:</b> {best ? `${best.name}, ${best.cost} credits` : 'none yet'}</p>
        </div>
      )}

      {failures > 0 && (
        <details class="hints">
          <summary>Engineering hints ({Math.min(failures, HINTS.length)} unlocked)</summary>
          <ul>{HINTS.slice(0, Math.min(failures, HINTS.length)).map((h) => <li>{h}</li>)}</ul>
        </details>
      )}

      {n.designs.length > 0 && (
        <div class="stage">
          <h3 class="dh">5. Explain</h3>
          <label class="lbl" for="dExplain">What made your best design work, and what did a failed design teach you?</label>
          <textarea id="dExplain" rows={4} value={n.designExplanation} placeholder={'Claim, evidence (drift, which story failed), reasoning.'}
            onInput={(e) => ctl.setDesignExplanation(e.currentTarget.value)} />
          <p class="hint">Every attempt and this explanation go into your notebook and lab report.</p>
        </div>
      )}
    </aside>
  );
}
