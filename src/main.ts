import { shearBuildingFrequencies } from './shake-table/specimen/modal.ts';

// Placeholder entry until phase 1 ports the prototype. Proves the build and the modal module work.
const [beat] = shearBuildingFrequencies([4000, 4000, 4000], [1.14e6, 1.14e6, 1.14e6]);
const out = document.querySelector<HTMLOutputElement>('#beat');
if (out && beat !== undefined) out.textContent = `${beat.toFixed(2)} Hz`;
