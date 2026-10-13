# Shake Table Lab

A 3D earthquake engineering lab for students. Pick a building, shake it on a full-size shake table, measure what happens, and replay any collapse in slow motion. Built on [three.js](https://threejs.org), [Poly Haven](https://polyhaven.com) assets and [Rapier](https://rapier.rs) physics.

The lab is being rebuilt from a single-file proof of concept into a full lab. The plan is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## What is here

| Path | What |
|---|---|
| `prototype/` | The proof of concept, frozen for comparison. Open `prototype/index.html` through any static server |
| `docs/ARCHITECTURE.md` | The architecture and delivery plan |
| `src/` | The new lab (early: only the modal analysis is ported so far) |
| `tests/unit/` | Unit tests (Vitest) |
| `tests/scenarios/baseline.json` | What the prototype measurably does, recorded by the characterization script |
| `scripts/characterize-prototype.ts` | Runs the prototype in headless Chromium and writes the baseline |

## Commands

Needs Node 22.18 or later.

```sh
npm ci              # install
npm run dev         # local dev server
npm test            # unit tests
npm run typecheck
npm run build       # static site in dist/
npm run characterize -- --repeats 2   # re-measure the prototype (needs network, about 10 minutes)
```

## Hosting

The site deploys to GitHub Pages from the default branch through `.github/workflows/ci.yml`. The prototype is published alongside it at `/prototype/`. In the repository settings, set Pages > Build and deployment > Source to "GitHub Actions".

## Credits

3D assets from Poly Haven (CC0).
