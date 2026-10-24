/** The design challenge: build your own building, predict, test it against a quake, improve. */
import { useEffect, useRef } from 'preact/hooks';
import { attemptLevel, bestDesign, levelGoal } from '../notebook.ts';
import { figureHtml } from '../figure.ts';
import { HINT_FIGURES } from '../hint-figures.ts';
import { compileSpecimen, SpecimenError } from '../specimen/compile.ts';
import { DAMPER, designCost, designSpec, FRAMES, ISOLATION, LEVELS, meetsLevel, TMD, type FrameChoice, type LevelId } from '../specimen/design.ts';
import { Seg, type Ctl } from './app.tsx';
import { ui } from './store.ts';

/** Ideas students unlock by failing, all about this model. Each has a picture in HINT_FIGURES, in the same order. */
const HINTS = [
  'A building fails where it is weakest. If one story is much weaker than the one below it, the bending piles up there. Engineers call it a soft story.',
  'If one side of a story is much stiffer than the other, shaking makes the building twist, and the flexible side moves far more than the middle. Bracing only one face is as stiff as a heavy frame on paper, but it twists. Keep the stiffness balanced.',
  'A stiffer frame moves less for the same shaking. It also has a faster natural beat, which moves it away from the slow swings of this quake.',
  'Dampers soak up energy like shock absorbers. They help most on a story that is close to failing, but they cannot save a frame that is far too weak.',
  'Lower stories carry the weight of everything above. When a story leans, that weight pushes it further over (the P-Delta effect), so tall buildings need their strength at the bottom.',
  'Drift is how far a story leans compared with its height. A building can stand after a big drift but be unsafe to use, which is why level 2 has a drift limit. Spread the stiffness so no single story takes all the bending.',
  'A tuned mass damper is a heavy block on the roof that swings against the building. It works best on a building that stays springy. Once a story yields, the building\'s beat changes and the damper is no longer tuned to it. Engineers mostly use them against steady swaying, such as from wind.',
  'Base isolation lets the ground move under the building. It works very well here, but it is the most expensive choice.',
];

export function DesignPanel({ ctl }: Ctl) {
  const d = ui.draft.value, n = ui.notebook.value, L = LEVELS[d.level];
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, []);
  const cost = designCost(d), over = cost > L.budget;
  let beat = '', problem = '';
  try { beat = `${compileSpecimen(designSpec(d)).modes[0]!.toFixed(2)} Hz`; } catch (e) { problem = e instanceof SpecimenError ? e.message : String(e); }
  const tries = n.designs.filter((a) => attemptLevel(a) === d.level);
  const last = tries.at(-1), best = bestDesign(n, d.level);
  const failures = tries.filter((a) => !a.survived).length;
  const pred = ui.designPrediction.value;
  const running = ui.tableLive.value;
  const order = d.frames.map((_, i) => i).reverse(); // top story first, as it stands

  return (
    <aside class="panel card" id="designPanel" aria-labelledby="dTitle">
      <button type="button" class="close" aria-label="Close the design challenge" onClick={() => ctl.explore()}>&times;</button>
      <div class="tags"><span class="tag model">Model</span><span class="step">Design challenge</span></div>
      <h2 id="dTitle" tabIndex={-1} ref={titleRef}>Design a building that survives</h2>
      <Seg id="segLevel" label="Challenge level" value={d.level} onPick={(v: LevelId) => ctl.setLevel(v)}
        options={([1, 2] as LevelId[]).map((k) => [k, `Level ${k}: ${LEVELS[k].stories} stories`])} />
      <p class="objective" id="dGoal"><b>Goal:</b> {levelGoal(d.level)}. Cheaper is better.</p>

      <h3 class="dh">1. Choose each story</h3>
      <div class="stories">
        {order.map((i) => (
          <div class="story-row">
            <div class="lbl">Story {i + 1}{i === 0 ? ' (ground)' : i === d.frames.length - 1 ? ' (top)' : ''}</div>
            <Seg id={`segStory${i + 1}`} label={`Story ${i + 1} frame`} value={d.frames[i]!}
              onPick={(v: FrameChoice) => ctl.editDraft((x) => { x.frames[i] = v; })}
              options={(Object.keys(FRAMES) as FrameChoice[]).map((k) => [k, `${FRAMES[k].short} ${FRAMES[k].cost}`])} />
            <label class="check"><input type="checkbox" id={`damp${i + 1}`} checked={d.dampers[i]} onChange={(e) => { const on = e.currentTarget.checked; ctl.editDraft((x) => { x.dampers[i] = on; }); }} /> {DAMPER.label} +{DAMPER.cost}</label>
          </div>
        ))}
        <label class="check base"><input type="checkbox" id="tmdBox" checked={!!d.tmd} onChange={(e) => { const on = e.currentTarget.checked; ctl.editDraft((x) => { x.tmd = on; }); }} /> {TMD.label} +{TMD.cost}</label>
        <label class="check base"><input type="checkbox" id="isoBox" checked={d.isolated} onChange={(e) => { const on = e.currentTarget.checked; ctl.editDraft((x) => { x.isolated = on; }); }} /> {ISOLATION.label} under the building +{ISOLATION.cost}</label>
      </div>

      <div class={`budget${over ? ' over' : ''}`}>
        <div class="budget-line"><span>Cost</span><b id="dCost">{cost} of {L.budget} credits</b></div>
        <div class="meter" role="meter" aria-label="Cost against the budget" aria-valuemin={0} aria-valuemax={L.budget} aria-valuenow={cost} aria-valuetext={`${cost} of ${L.budget} credits${over ? ', over budget' : ''}`}>
          <i style={{ width: `${Math.min(100, (100 * cost) / L.budget)}%` }} />
        </div>
        {over && <p class="hint">Over budget. You can still test it, but it does not count for the challenge.</p>}
        <p class="hint">Natural beat (model): <b>{beat || 'not available'}</b>. The quake shakes hardest below about 1.5 Hz.</p>
        {problem && <p class="feedback differ" role="status">{problem}</p>}
      </div>

      <h3 class="dh">2. Predict</h3>
      <fieldset class="predict">
        <legend>Will your building survive the {L.g} g quake?</legend>
        {(['survive', 'collapse'] as const).map((v) => (
          <label class={`option${pred === v ? ' picked' : ''}`}>
            <input type="radio" name="designPredict" checked={pred === v} onChange={() => (ui.designPrediction.value = v)} />
            {v === 'survive' ? 'It will survive' : 'It will collapse'}
          </label>
        ))}
      </fieldset>

      <h3 class="dh">3. Test</h3>
      <button type="button" class="btn primary big" id="dTest" disabled={!pred || running || !!problem} onClick={() => ctl.testDesign()}>
        {running ? 'Test running' : pred ? `Shake it at ${L.g} g` : 'Make a prediction first'}
      </button>

      {last && (
        <div class="stage" id="dResult">
          <h3 class="dh">4. Observe</h3>
          <p class={`feedback ${meetsLevel(d.level, last) ? 'match' : 'differ'}`}>
            <b>{!last.survived ? `Collapsed. ${last.failure}.` : meetsLevel(d.level, last) ? `Challenge met. ${last.cost} credits.` : `Survived. ${last.cost} credits.`}</b>{' '}
            Largest story drift: {last.maxDriftPct.toFixed(1)}%.{' '}
            {last.survived && last.residualPct !== undefined && last.residualPct >= 0.1 && `It now leans ${last.residualPct.toFixed(1)}% for good, because a story bent past its yield point. `}
            {last.prediction && (last.prediction === (last.survived ? 'survive' : 'collapse') ? 'Your prediction was right.' : 'Your prediction was wrong. What surprised you?')}
            {last.survived && L.maxDriftPct !== null && last.maxDriftPct > L.maxDriftPct && ` That drift is over the ${L.maxDriftPct}% limit: the building stands, but it would not be safe to use. `}
            {last.survived && last.cost > L.budget && ' It is over budget, so try a cheaper design.'}
          </p>
          <p id="dBest"><b>Best design so far:</b> {best ? `${best.name}, ${best.cost} credits` : 'none yet'}</p>
        </div>
      )}

      {failures > 0 && (
        <details class="hints">
          <summary>Engineering hints ({Math.min(failures, HINTS.length)} unlocked)</summary>
          <ul>{HINTS.slice(0, Math.min(failures, HINTS.length)).map((h, k) => (
            <li>
              {h}
              <div dangerouslySetInnerHTML={{ __html: figureHtml(HINT_FIGURES[k]!) }} />
            </li>
          ))}</ul>
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
