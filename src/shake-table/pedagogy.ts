/**
 * The teaching design made explicit: learning objectives, and for each guided test a
 * Predict, Test, Observe, Explain cycle. On-screen text follows the house rules: no em
 * dashes, no semicolons, no middle dots.
 */

export interface Objective { id: string; text: string }

/** Draft course-level objectives for the lab (docs/ARCHITECTURE.md 8.9). */
export const OBJECTIVES: Objective[] = [
  { id: 'LO1', text: 'Explain resonance as a match between shaking frequency and a building\'s natural frequency.' },
  { id: 'LO2', text: 'Determine a building\'s natural frequency from test data.' },
  { id: 'LO3', text: 'Compare how bare, braced and base-isolated buildings respond to the same shaking.' },
  { id: 'LO4', text: 'Use evidence from tests to judge which design keeps people safer.' },
  { id: 'LO5', text: 'Identify nonstructural hazards that can hurt people in an earthquake.' },
];

export interface PoeStep {
  objective: string; // what the student will be able to do after this test
  objectiveIds: string[];
  predict: { question: string; options: string[]; answer: number; why: string };
  explain: string; // the claim, evidence, reasoning prompt
}

/** One entry per guided test, in the same order as STOPS in tour.ts. */
export const POE: PoeStep[] = [
  {
    objective: 'Describe how a shake table recreates earthquake shaking in a lab.',
    objectiveIds: ['LO1'],
    predict: {
      question: 'The table will shake steadily at 3 Hz. What will the building do?',
      options: ['Sway hard and crack', 'Move with the table and barely bend', 'Collapse'],
      answer: 1,
      why: '3 Hz is far from your building\'s natural beat of about 1.2 Hz, so each push does not build on the last one.',
    },
    explain: 'Which parts moved with the table, and which lagged behind? Use the chrome rods and the roof swing readout as evidence.',
  },
  {
    objective: 'Find a building\'s natural frequency from test data.',
    objectiveIds: ['LO1', 'LO2'],
    predict: {
      question: 'The table sweeps from 0.6 Hz to 4 Hz. Near which frequency will the roof swing hardest?',
      options: ['Near 0.6 Hz', 'Near 1.2 Hz', 'Near 2.5 Hz', 'Near 4 Hz'],
      answer: 1,
      why: 'The model\'s natural beat is about 1.2 Hz. Shaking in time with it adds to every swing, which is resonance.',
    },
    explain: 'At what frequency did the roof swing hardest, or the building fail? Compare it with the natural beat readout and explain the match.',
  },
  {
    objective: 'Explain why the same strength of shaking can be harmless or destructive.',
    objectiveIds: ['LO1'],
    predict: {
      question: 'Same strength as the sweep, but steady at 3 Hz. What happens?',
      options: ['The building collapses', 'The building cracks but stands', 'The building barely moves'],
      answer: 2,
      why: 'Strength alone does not decide damage. Frequency matters too, and 3 Hz is far from your building\'s natural beat.',
    },
    explain: 'Press Shake at 1.2 Hz, then compare the two runs. Use both results to explain what decides whether shaking is destructive.',
  },
  {
    objective: 'Relate a building\'s stiffness to its natural frequency and its damage.',
    objectiveIds: ['LO2', 'LO3'],
    predict: {
      question: 'Braces make each story about six times stiffer. What will the braced building do in the same sweep?',
      options: ['Collapse sooner', 'Crack but stay up', 'Not move at all'],
      answer: 1,
      why: 'A stiffer building has a faster beat, about 2.9 Hz here, so resonance comes later in the sweep. It still cracks, but stays up.',
    },
    explain: 'Where did the roof swing hardest this time? Compare the peak roof swing with the bare frame\'s and explain the difference.',
  },
  {
    objective: 'Explain how base isolation protects the floors above.',
    objectiveIds: ['LO3', 'LO4'],
    predict: {
      question: 'The building sits on soft rubber bearings. Compared with the ground, how much will floor 2 move?',
      options: ['More than the ground', 'About the same', 'Much less than the ground'],
      answer: 2,
      why: 'The bearings are soft side to side, so the ground moves under your building while the floors above move slowly and gently.',
    },
    explain: 'Watch the crates on floor 2, then the bearings in the Orbit camera. Where did the motion go? Use the story drift readouts as evidence.',
  },
  {
    objective: 'Identify nonstructural hazards and the order things fail in.',
    objectiveIds: ['LO4', 'LO5'],
    predict: {
      question: 'A strong quake hits the bare frame. What will come down first?',
      options: ['The unreinforced block wall', 'The building\'s first story', 'Nothing comes down'],
      answer: 1,
      why: 'In this model the first story fails about 6 s in, the furniture starts tumbling right after, and the block wall comes down about 2 s later.',
    },
    explain: 'Use Replay at 0.25x. Name three things in this scene that would hurt someone standing nearby, and when each one became dangerous.',
  },
];

export const POE_STEPS = ['Predict', 'Test', 'Observe', 'Explain'] as const;

/**
 * Multimedia learning (Mayer). The diagrams give each idea in words and pictures (dual
 * coding, figure.ts). These rules decide how the words and pictures are put together:
 *
 * - Pre-training: the key words of a test are defined before its reading (GLOSSARY).
 * - Signaling: key words are marked in the reading, and each diagram in the panel opens
 *   with a short cue that says where to look.
 * - Redundancy: in the panel the cue replaces the full caption, which would repeat the
 *   reading beside it. The full caption stays in the text version and the report.
 * - Coherence: side facts that are not needed to predict sit in a closed Real world box.
 * - Segmenting: Observe comes in two steps the student moves through at their own pace,
 *   first what was measured, then why it happened.
 * - Spatial contiguity: the student's own measurement is drawn on the result diagram, and
 *   the explanation sits right under the diagram it explains.
 * - Temporal contiguity: the explanation and its diagram appear at the same moment, and
 *   the Notice cue stays on screen while the test runs.
 * - Modality: a Listen button reads the words aloud, so the eyes can stay on the diagram.
 * - Personalization: the text talks to the student, about your building and your run.
 */

/** Key words, each taught before the test that first uses it. Keys match Stop.terms in tour.ts. */
export const GLOSSARY: Record<string, string> = {
  'shake table': 'A steel platform that is pushed back and forth to copy an earthquake.',
  'actuator': 'A powerful hydraulic piston. Its chrome rod pushes the table.',
  'story': 'One level of a building, from one floor up to the next.',
  'natural beat': 'The rhythm a building sways at on its own after a push. Engineers call it the natural frequency.',
  'resonance': 'Pushing in time with the natural beat, so each push adds to the last swing.',
  'Hz': 'Hertz, the number of back and forth shakes each second. 2 Hz is two shakes a second.',
  'strength': 'How hard the table shakes, in g. 0.2 g is one fifth of the pull of gravity.',
  'frequency': 'How many shakes there are each second, in Hz.',
  'X-brace': 'Two steel bars crossed inside a story, so the story cannot lean easily.',
  'stiffness': 'How hard a story is to bend sideways. A stiffer story bends less.',
  'base isolation': 'Setting the whole building on soft bearings so the ground can move under it.',
  'rubber bearing': 'A thick pad of rubber and steel layers. It is firm up and down but soft side to side.',
  'drift': 'How far a story leans compared with its height, as a percent.',
  'structure': 'The parts that hold a building up: columns, beams, floors and braces.',
  'nonstructural parts': 'Everything else, such as walls with no steel inside, furniture, shelves and ceilings.',
};
export type PoeStage = (typeof POE_STEPS)[number];
