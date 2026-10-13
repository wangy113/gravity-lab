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
      why: '3 Hz is far from this building\'s natural beat of about 1.2 Hz, so each push does not build on the last one.',
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
      why: 'Strength alone does not decide damage. Frequency matters: 3 Hz is far from the natural beat.',
    },
    explain: 'Then press Reset, set Frequency to 1.2 Hz and shake again. Use both results to explain what decides whether shaking is destructive.',
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
      why: 'The bearings are soft side to side, so the ground moves under the building while the floors above move slowly and gently.',
    },
    explain: 'Watch the crates on floor 2, then the bearings in Orbit view. Where did the motion go? Use the story drift readouts as evidence.',
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
export type PoeStage = (typeof POE_STEPS)[number];
