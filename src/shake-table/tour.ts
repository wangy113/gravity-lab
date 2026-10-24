/**
 * The six guided tests. The configurations come from the prototype (STOPS). The text is
 * written to the student, with key words taught first and side facts kept apart (see the
 * multimedia notes in pedagogy.ts). Body text is trusted HTML written by the lab's authors.
 */
import type { BuildingType } from './constants.ts';
import type { ShakeMode } from './motion/table.ts';
import type { CameraMode } from './scene/view.ts';

export type Tag = 'real' | 'model';
export interface Stop {
  title: string;
  tags: Tag[];
  cfg: { type: BuildingType; mode: ShakeMode; f?: number; g: number; cam: CameraMode; stress: boolean };
  /** Key words taught before the reading (pre-training). Each one is in GLOSSARY in pedagogy.ts and marked in the body. */
  terms: string[];
  /** The core explanation, written to the student. Key words are marked with class="term" (signaling). */
  body: string;
  /** Interesting real world facts that are not needed for the prediction. Kept out of the main reading (coherence). */
  aside?: string;
  notice: string;
}

export const TAG_NAMES: Record<Tag, string> = { real: 'Real world', model: 'Model' };

const term = (w: string): string => `<b class="term">${w}</b>`;

export const STOPS: Stop[] = [
  { title: 'A table that makes earthquakes', tags: ['real'], cfg: { type: 'bare', mode: 'steady', f: 3.0, g: 0.15, cam: 'orbit', stress: true },
    terms: ['shake table', 'actuator', 'story'],
    body: `<p>You are about to test a building the way engineers do. It is bolted to a steel ${term('shake table')}, and a hydraulic ${term('actuator')} pushes the table back and forth. The motion can copy a real earthquake.</p><p>Your building is a three-story steel frame with concrete floors and furniture inside. Each ${term('story')} is one level, from one floor up to the next.</p>`,
    aside: `<p>The largest table in the world is E-Defense in Miki, Japan. It is 20 m by 15 m and can carry 1,200 tonnes. In 2009 it shook a full-size seven-story wood building.</p>`,
    notice: 'As your test runs, watch the two chrome rods on the left. What moves with the table, and what lags behind?' },
  { title: "Find the building's beat", tags: ['model'], cfg: { type: 'bare', mode: 'sweep', g: 0.2, cam: 'side', stress: true },
    terms: ['natural beat', 'resonance', 'Hz'],
    body: `<p>Every building has a ${term('natural beat')}. It is the rhythm the building sways at on its own. If you push in time with that rhythm, each push adds to the last swing. That is ${term('resonance')}.</p><p>In this test the table starts slow and speeds up from 0.6 ${term('Hz')} to 4 Hz over 32 seconds. Stress colors are on, so you will see each story turn from green to red as it bends.</p>`,
    notice: 'Keep an eye on the Roof swing readout and the chart. At what frequency does your roof swing hardest? Compare it with the natural beat.' },
  { title: 'Same strength, different beat', tags: ['model'], cfg: { type: 'bare', mode: 'steady', f: 3.0, g: 0.2, cam: 'orbit', stress: true },
    terms: ['strength', 'frequency'],
    body: `<p>Now the table shakes at 3 Hz with the same ${term('strength')} as before. Only the ${term('frequency')} is different, and 3 Hz is far from your building's beat.</p><p>When it is done, press Reset, set Frequency to 1.2 Hz and press Shake again.</p>`,
    notice: 'Why can the same strength of shaking do almost nothing at one frequency and bring your building down at another?' },
  { title: 'Brace it', tags: ['model', 'real'], cfg: { type: 'braced', mode: 'sweep', g: 0.2, cam: 'side', stress: true },
    terms: ['X-brace', 'stiffness'],
    body: `<p>Steel ${term('X-braces')} make each story about six times stiffer. More ${term('stiffness')} gives your building a faster natural beat, so the danger zone moves up the frequency scale.</p>`,
    aside: `<p>Many real steel buildings use braced frames for this reason.</p>`,
    notice: 'Where does the roof swing hardest now? Did any story crack, and did your building stay up?' },
  { title: 'Float it', tags: ['model', 'real'], cfg: { type: 'isolated', mode: 'quake', g: 0.35, cam: 'ride', stress: true },
    terms: ['base isolation', 'rubber bearing', 'drift'],
    body: `<p>${term('Base isolation')} sets the whole building on ${term('rubber bearings')}. The bearings are soft side to side, so the ground moves under your building while the floors above move slowly and gently.</p><p>The camera rides along with you on floor 2. The story ${term('drift')} readouts show how far each story leans.</p>`,
    aside: `<p>San Francisco City Hall was retrofitted with base isolators after the 1989 Loma Prieta earthquake.</p>`,
    notice: 'Watch the crates on floor 2 with you. Then switch to Orbit and watch the black bearings. Where did the motion go?' },
  { title: 'What falls first', tags: ['real', 'model'], cfg: { type: 'bare', mode: 'quake', g: 0.4, cam: 'orbit', stress: true },
    terms: ['structure', 'nonstructural parts'],
    body: `<p>The block wall on the right has no steel inside. Furniture, shelves and ceilings are not part of the ${term('structure')} either. Engineers call these ${term('nonstructural parts')}, and they are what hurts people in a room.</p>`,
    aside: `<p>In studies of offices, hotels and hospitals, nonstructural parts made up about half to 70 percent of a building's cost.</p>`,
    notice: 'After the quake, press Replay and pick 0.25x. Name three things in this scene that would hurt someone standing nearby.' },
];
