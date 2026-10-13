import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative paths, so the site works under https://<user>.github.io/gravity-lab/
  base: './',
  build: { target: 'es2022' },
  test: { include: ['tests/unit/**/*.test.ts', 'tests/scenarios/**/*.test.ts'] },
});
