/**
 * The six guided tests, verbatim from the prototype (STOPS). Phase 3 moves lessons into
 * content files. Body text is trusted HTML written by the lab's authors.
 */
import type { BuildingType } from './constants.ts';
import type { ShakeMode } from './motion/table.ts';
import type { CameraMode } from './scene/view.ts';

export type Tag = 'real' | 'model';
export interface Stop {
  title: string;
  tags: Tag[];
  cfg: { type: BuildingType; mode: ShakeMode; f?: number; g: number; cam: CameraMode; stress: boolean };
  body: string;
  notice: string;
}

export const TAG_NAMES: Record<Tag, string> = { real: 'Real world', model: 'Model' };

export const STOPS: Stop[] = [
  { title: 'A table that makes earthquakes', tags: ['real'], cfg: { type: 'bare', mode: 'steady', f: 3.0, g: 0.15, cam: 'orbit', stress: false },
    body: `<p>Engineers test buildings by bolting them to a steel table and pushing the table with hydraulic actuators. The motion can copy a real earthquake.</p><p>The largest table in the world is E-Defense in Miki, Japan. It is 20 m by 15 m and can carry 1,200 tonnes. In 2009 it shook a full-size seven-story wood building.</p><p>This lab is smaller. The building is a three-story steel frame with concrete floors and furniture inside.</p>`,
    notice: 'Run the test and watch the two chrome rods on the left. What moves with the table, and what lags behind?' },
  { title: "Find the building's beat", tags: ['model'], cfg: { type: 'bare', mode: 'sweep', g: 0.2, cam: 'side', stress: true },
    body: `<p>Every building has a natural frequency. It is the rhythm the building sways at on its own. Push in time with that rhythm and each push adds to the last swing. That is resonance.</p><p>This test starts slow and speeds up from 0.6 Hz to 4 Hz over 32 seconds. Stress colors are on, so each story turns from green to red as it bends.</p>`,
    notice: "Watch the Roof swing readout and the chart. At what frequency does the roof swing hardest? Compare it with the natural beat." },
  { title: 'Same strength, different beat', tags: ['model'], cfg: { type: 'bare', mode: 'steady', f: 3.0, g: 0.2, cam: 'orbit', stress: true },
    body: `<p>Now the table shakes at 3 Hz with the same strength as before. That is far from the building's beat.</p><p>When it is done, press Reset, set Frequency to 1.2 Hz and press Shake again.</p>`,
    notice: 'Why can the same strength of shaking do almost nothing at one frequency and bring the building down at another?' },
  { title: 'Brace it', tags: ['model', 'real'], cfg: { type: 'braced', mode: 'sweep', g: 0.2, cam: 'side', stress: true },
    body: `<p>Steel X-braces make each story about six times stiffer. A stiffer building has a faster natural beat, so the danger zone moves up the frequency scale.</p><p>Many real steel buildings use braced frames for this reason.</p>`,
    notice: 'Where does the roof swing hardest now? Did any story crack, and did the building stay up?' },
  { title: 'Float it', tags: ['model', 'real'], cfg: { type: 'isolated', mode: 'quake', g: 0.35, cam: 'ride', stress: false },
    body: `<p>Base isolation sets the whole building on rubber bearings. The bearings are soft side to side, so the ground moves under the building while the floors above move slowly and gently.</p><p>San Francisco City Hall was retrofitted with base isolators after the 1989 Loma Prieta earthquake.</p><p>The camera rides along on floor 2.</p>`,
    notice: 'Watch the crates on floor 2. Then switch to Orbit and watch the black bearings. Where did the motion go?' },
  { title: 'What falls first', tags: ['real', 'model'], cfg: { type: 'bare', mode: 'quake', g: 0.3, cam: 'orbit', stress: false },
    body: `<p>The block wall on the right has no steel inside. Furniture, shelves and ceilings are not part of the structure either. Engineers call these nonstructural parts.</p><p>In studies of offices, hotels and hospitals, nonstructural parts made up about half to 70 percent of a building's cost. They are also what hurts people in a room.</p>`,
    notice: 'After the quake, press Replay and pick 0.25x. Name three things in this scene that would hurt someone standing nearby.' },
];
