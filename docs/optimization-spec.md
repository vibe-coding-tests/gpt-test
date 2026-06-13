# PokéKart Optimization Spec

Status: draft · Owner: TBD · Scope: performance, gameplay-code architecture, testing, build health

## 1. Summary

PokéKart is ~14.6k lines of TypeScript running a real-time 3D racer on Phaser 3 (HUD + input + sprites) layered over a Three.js world (`ThreeView`). The game works and looks good. Three things are holding it back:

1. **Per-frame allocations and redundant geometry work.** The hot loop allocates hundreds of short-lived objects every frame and rebuilds projection/lookAt math that rarely changes. At 8 racers plus scenery, the Three.js scene issues roughly 450–1000+ draw calls per frame with one rig and one material set built per racer instead of shared.
2. **Simulation is welded to the renderer.** `Racer` takes a `Phaser.Scene` in its constructor and owns its own sprites and audio calls (`src/race/Racer.ts:1`, `:138`). You cannot run the physics without a browser and a Phaser scene. That single fact blocks headless unit tests, deterministic replays, and any profiling that isn't "watch the FPS counter."
3. **Testing and build health are thin.** The production build is currently **red** (`tsc --noEmit` fails, see §9). The only tests are 4 Playwright end-to-end flows plus 1 screenshot diagnostic. The genuinely pure logic (`Stats.ts`, `util.ts`, `TrackGeometry.ts`, the data tables) has zero unit tests.

These connect. Decoupling the simulation from the renderer is the keystone: it unlocks headless tests *and* makes the per-frame allocation cleanup safe to do, because you can assert the sim still behaves identically.

This spec defines five workstreams (rendering perf, simulation perf, sim/render decoupling + determinism, testing, build/CI) with concrete changes, acceptance criteria, and a phased rollout.

## 2. Current state (baseline)

Measured by reading the code on this branch. Fill in the empty metric cells once §11 instrumentation lands.

| Area | Observation | Evidence |
|---|---|---|
| Build | `npm run build` fails typecheck | `src/scenes/RaceScene.ts:106` vs `src/systems/SaveSystem.ts:6` |
| Tests | 4 e2e flows + 1 diagnostic; no unit tests | `tests/game.spec.ts`, `tests/diag.spec.ts` |
| Test runtime | `fullyParallel: false`, `workers: 1` | `playwright.config.ts:7` |
| Frame loop | No FPS cap; runs at `requestAnimationFrame` | `src/main.ts:15` (no `fps` config) |
| Draw calls / frame | ~450–1000+ in chase view | §5 inventory |
| Per-frame allocations | Hundreds of objects/arrays/closures | §5, §6 inventories |
| FPS instrumentation | Exists behind the `overlay` cheat | `src/scenes/HudScene.ts:345` (`game.loop.actualFps`) |
| Determinism | Mixed `Rng` (seeded) and `Math.random()` | `src/util.ts:23` vs `src/scenes/RaceScene.ts:134`,`:538` |
| Bundle | Phaser + Three; `chunkSizeWarningLimit: 2200` | `vite.config.ts:6` |

## 3. Goals and non-goals

### Goals

- Hold a stable 60 fps in chase view with 8 racers and a busy combat moment (multiple projectiles, drift particles, hazards) on a mid-tier laptop integrated GPU.
- Cut steady-state per-frame heap allocation in the race loop to near zero, so GC pauses stop causing frame hitches.
- Make the core simulation runnable headless and deterministically, with a seed.
- Stand up a unit + integration test layer that runs in CI in seconds, plus keep the e2e smoke tests.
- Get `npm run build` green and gated in CI so it stays green.

### Non-goals

- No rewrite of the renderer or a switch off Phaser/Three.
- No gameplay redesign. Balance and feel changes are out of scope except where a perf fix would change behavior, in which case the fix must preserve behavior (verified by the new tests).
- No art pipeline change. Procedural generation stays.
- No multiplayer or networking work.

## 4. North-star architecture

One principle drives most of this work: **the simulation computes state; the presentation layer draws state.** Today `Racer.update()` mutates physics and pushes sprites and audio in the same method. We split that seam.

Target shape:

- A **sim core** (`Racer`, `ItemManager`, `MoveManager`, `HazardManager`, `RaceDirector`, `TrackGeometry`) that depends only on plain data, `util.ts`, and a seeded `Rng`. No `import Phaser`, no `THREE`, no `Audio`, no `effects`. It exposes state (positions, status, ranks) and a queue of **events** ("hit", "drift release", "lap crossed", "balloon popped").
- A **presentation layer** (`ThreeView`, `Scenery`, `effects`, `AudioSystem`, the sprite billboards) that reads sim state each frame and drains the event queue to fire particles, audio, and toasts.
- `RaceScene` becomes the thin wiring between them: gather input → step sim → render state + drain events.

Two payoffs fall out of this seam:

- **Testability.** You can construct a race with a seed, step it 60 times, and assert "Pikachu finished lap 1" without a browser. That is impossible today.
- **Perf.** Once the sim owns no GameObjects, the allocation cleanup (out-params, pooled option structs, cached projections) is mechanical and verifiable. The tests guard against behavior drift while you optimize.

This is a big refactor, so §10 sequences it after the cheap wins. The cheap wins do not require it.

## 5. Workstream A: Rendering performance

`ThreeView` is the renderer. The architecture is sound (dual canvas, billboards, particle pool, throttled ground-texture upload). The costs are concentrated in a few hot paths.

### A1. `groundH()` re-projects with no hint, ~200–300×/frame — HIGH

`submit()` calls `groundH(wx, wy)` for every placed object (`src/systems/ThreeView.ts:586`), and `groundH` calls `geom.project(x, y)` with **no hint** (`:287`). Without a hint, `project()` scans 256 samples then refines (`src/systems/TrackGeometry.ts:209-221`). With ~200–300 submits per frame, that is tens of thousands of distance checks per frame purely for ground height.

Fix: thread a projection hint into `submit`/`groundH`. Racers, items, and hazards already hold a recent `proj.idx`; pass it. For scenery props that sit at a fixed `(s, d)`, precompute ground height once at spawn.

### A2. `project()` double-projects on hill tracks — MED

The screen-space `project()` used by fx calls `this.geom.project(wx, wy).s` *again* after already having camera-space data (`src/systems/ThreeView.ts:549-552`). Reuse one projection.

### A3. Camera matrix rebuilt every frame — MED

`follow()` calls `cam.updateProjectionMatrix()` every frame (`src/systems/ThreeView.ts:521`) even though FOV (`Feff`) changes slowly, and uses `cam.lookAt()` (`:526`) which recomputes the full view matrix. Skip `updateProjectionMatrix` when `|Feff - lastFeff|` is below an epsilon; set camera orientation from the yaw/pitch we already compute instead of `lookAt`.

### A4. One rig + one material set built per racer — HIGH

`ensureBill` calls `buildMonRig(id, heightPx)` per billboard (`src/systems/ThreeView.ts:647`), and `buildMonRig` creates a fresh `MeshLambertMaterial` and `THREE.Color` per body part (`src/systems/monmodel.ts:56-67`, `:1763`). Eight Pikachu would build eight independent rigs with eight full material sets. Geometry is already shared via `geoCache` (good); materials and meshes are not.

Fix: pool rigs keyed by `(speciesId, heightBucket)`. Share a per-species material palette. A rig instance only needs its own transforms and a tint uniform.

### A5. Scenery and shadows are not instanced — HIGH/MED

~64 roadside props and ~30 crowd sprites each become an individual `THREE.Mesh` plane (`src/systems/Scenery.ts:124-142`, `:182-200`). Ground shadow decals are many identical flat planes (`src/race/Racer.ts:1031`). Move repeated billboards to `InstancedMesh` grouped by texture key, and shadows to a single instanced quad buffer.

### A6. Flock birds become full 3D rigs — HIGH

Distant flock birds use `pk-*` textures, and any `pk-*` key without `bill: true` builds a full `MonRig` (`src/systems/ThreeView.ts:623`, `src/systems/Scenery.ts:316`). Six to ten distant birds should be cheap planes. Pass `{ bill: true }` for flocks.

### A7. Per-frame `BillOpts` object literals — HIGH (shared with §6)

Every `submit` caller builds a fresh options object each frame: scenery (~120×), racers (3× each, `src/race/Racer.ts:996-1041`), items, moves, hazards. Reuse a pooled per-entity `BillOpts` scratch object and mutate fields before submit.

### A8. Renderer settings — MED/LOW

`antialias: true` at 1280×720 (`src/systems/ThreeView.ts:257`). Evaluate `antialias: false` plus optional FXAA, gated by a quality setting. `MeshLambertMaterial` on every model part does per-fragment lighting across hundreds of meshes; a flat/toon material would suit the art and cost less. Cap pixel ratio explicitly on retina (`min(devicePixelRatio, 1.5)`).

### A9. Dynamic ground texture upload — MED

Skid marks stamp into the full-world canvas (e.g. ~3330×2260) and re-upload the whole texture when dirty (`src/systems/ThreeView.ts:320`, `:879`). The 0.35s throttle helps. Consider a small separate overlay texture for dynamic marks so a skid does not re-upload the entire ground.

### A10. Dead code — LOW

Remove the unused `V3` helper (`src/systems/monmodel.ts:15`) and the unused `tmp` color (`:1776`).

### Acceptance criteria (Workstream A)

- Chase view holds 60 fps with 8 racers + a scripted combat burst on the target machine.
- Three.js draw calls per frame drop measurably (target: cut racer + scenery draw calls by ≥50% via pooling/instancing). Measure with `renderer.info.render.calls`.
- No `buildMonRig` calls during steady-state racing (only on spawn/evolve). Assert via a build counter in a dev test.
- `submit` issues zero object-literal allocations in steady state (verified by a Chrome allocation-timeline spot check).

## 6. Workstream B: Simulation performance

`TrackGeometry` is well built: 1024-sample centerline, arc-length tables, typed arrays, projection hints. The cost is object churn and a few all-pairs loops, not the spline math itself.

### B1. `project` / `sample` / `posOf` allocate per call — HIGH

Each returns a fresh object literal (`src/systems/TrackGeometry.ts:171-191`, `:199-228`). These run at least once per racer per frame, plus AI, hazards, and every active projectile. Add out-param variants that write into a caller-owned struct (`projectInto(x, y, hint, out)`), and keep the allocating versions for cold paths.

### B2. `aiCtx` rebuilt with array spreads every frame — HIGH

`RaceScene.update` builds `aiCtx` by spreading two freshly allocated arrays from `hazards.avoidPoints()` and `items.avoidPoints()` (`src/scenes/RaceScene.ts:321-325`), then ~7 AI drivers read it. Both `avoidPoints()` implementations allocate and `push` every frame. Fill a shared, pre-sized buffer in place and reuse one context object.

### B3. `MoveManager.updateShots` projects with no hint — HIGH

Active shots project without a hint (~265 distance checks per shot per frame). Carry an `idxHint` on each `Shot` like `ItemManager` already does for projectiles.

### B4. Broad-phase for entity↔racer interactions — HIGH

Item boxes × racers, projectiles × racers, hazards × racers, and move zones × racers are all nested loops re-tested every frame (`src/race/ItemManager.ts`, `src/race/HazardManager.ts`, `src/race/MoveManager.ts`). With n=8 this is tolerable but it compounds. Add one coarse broad-phase keyed by track `s` (and `d` bucket), shared by all managers, and only run narrow-phase circle tests on candidates within range.

### B5. `featuresNear` filters + `reverse` every AI frame — MED

`AIDriver` calls `geom.featuresNear(...).reverse()` each frame (`src/race/AIDriver.ts:79`); `featuresNear` allocates a filtered array (`src/systems/TrackGeometry.ts:242-246`). Precompute feature intervals bucketed by sample index at track load and look them up without allocating.

### B6. Standings sorted every frame — MED

`RaceDirector.updateRanks()` copies and sorts the racer array every frame (`src/race/RaceDirector.ts:19`), as does `updateBattleRanks` (`src/scenes/RaceScene.ts:411`). Sorting 8 elements is cheap; the array copy is the waste. Sort in place on a reused array, or throttle ranks to ~10 Hz (visually identical for the position card).

### B7. Smaller per-frame churn — LOW/MED

`Object.keys(this.status)` per racer per frame (`src/race/Racer.ts:575`); double `slopeAt` on hill tracks (`:724`,`:883`); `tailPos()` called twice in one branch (`:873`); `racers.find(r => r.isPlayer)` and `racers.reduce(...)` every `ItemManager.update` (`src/race/ItemManager.ts:210`,`:223`). Cache or hoist each.

### Acceptance criteria (Workstream B)

- Steady-state race loop allocates near zero per frame (Chrome allocation timeline shows a flat sawtooth, no per-frame spikes).
- No behavior change: the §7/§8 deterministic replay test produces an identical finish order and lap times before and after each B change.
- Simulation step time (sim only, excluding render) stays under a defined budget (target: < 2 ms for 8 racers; confirm with the §11 harness).

## 7. Workstream C: Determinism and sim/render decoupling

This is the keystone refactor from §4. It is the largest item and the highest leverage.

### C1. One seeded RNG for the whole sim — HIGH

A deterministic `Rng` (LCG) already exists (`src/util.ts:23`) and `HazardManager` takes a seed. But the sim also calls `Math.random()` directly: grid shuffle and AI rocket starts (`src/scenes/RaceScene.ts:134`,`:538`), demo input (`:548`), the hazard seed itself (`src/scenes/RaceScene.ts:161`), item/move rolls, and particle jitter. Route every gameplay-affecting random through one seeded `Rng` owned by the race. Leave purely cosmetic jitter (particle scatter) on `Math.random()` or a separate cosmetic RNG so visuals never affect outcomes.

Acceptance: same seed + same input script ⇒ identical finish order and lap times, asserted in a test.

### C2. Lift Phaser/Three out of the sim classes — HIGH

`Racer` imports Phaser, `Audio`, `effects`, and `ThreeView`, and creates `sprite`/`shadow`/`shieldImg` in its constructor (`src/race/Racer.ts:1-10`,`:131-133`,`:138`). Extract the GameObject ownership and the audio/fx calls into a `RacerView` (presentation) that mirrors a plain `Racer` sim object. The sim emits events; `RacerView` renders them. Do the same for the managers.

This can be incremental: introduce a `RaceEvents` queue first, move audio/fx calls to drain from it, then move the GameObjects out last.

### C3. Headless step API — MED

Expose `race.step(dt, inputs)` that advances the sim with no rendering, plus a way to feed a recorded input script. The existing demo AI and `Ghost` recorder show the input/replay shape already exists; this formalizes it.

### Acceptance criteria (Workstream C)

- The sim core compiles and runs in Node with no DOM, no Phaser, no Three (enforced by a test that imports the sim entry and steps it).
- A seeded headless race of N frames is bit-for-bit reproducible across runs.
- No behavior change in the browser: the e2e smoke tests still pass.

## 8. Workstream D: Testing strategy

Today: 4 Playwright flows (boot, menu→race, settings persistence, save load) and 1 screenshot diagnostic. They run against the Vite dev server, so they never typecheck the build, and they need a real WebGL context (swiftshader). Good as smoke tests, too slow and too coarse for logic coverage.

Add three layers below the e2e layer.

### D1. Unit tests for pure logic — start here, no refactor needed

These modules are already pure and testable today:

- `src/systems/Stats.ts`: `deriveStats` (stat ranges, stage multiplier, class bases), `typeEffect` (Gen-1 chart: electric vs ground = 0, fire vs grass = 2, stacked types multiply), `offroadMult`, `waterMult`.
- `src/util.ts`: `clamp`, `lerp`, `wrap01`, `wrapAngle`, `rotLerp`, `Rng` (deterministic sequence for a fixed seed), `fmtTime`, `ordinal`.
- `src/systems/TrackGeometry.ts`: `project` round-trips (`posOf(s,d)` then `project` returns ~`(s,d)`), arc-length monotonicity, `inRange` wrap-around, `surfaceAtProj` boundaries, `nearestSafeSpot` returns a safe surface.
- `src/systems/SaveSystem.ts`: unlock-order progression, XP→move-unlock thresholds, trophy reward rules (`recordTrophy`), loadout filtering, save round-trip via a `localStorage` mock.

Tooling: add **Vitest** (fast, ESM-native, TS-friendly, shares the Vite config). Target sub-second runs.

### D2. Data-integrity tests — cheap, high value

Assert invariants over the data tables so content edits cannot silently break the game:

- All 151 Pokémon present and unique IDs (`src/data/pokemonData.ts`).
- Every move id referenced by a pool exists in `MOVES` (`src/data/movesData.ts`).
- README claim: every move pool's first two unlocks include a defensive option (guard/stance).
- `UNLOCK_ORDER` has no duplicates and references valid IDs; `STARTER_IDS` ⊆ valid IDs (`src/constants.ts`).
- `ITEM_WEIGHTS` rows have 8 entries and no negatives.
- Every track's Catmull-Rom loop is closed and has features within the corridor (`src/data/trackData.ts`).

### D3. Headless simulation tests — after Workstream C

Once the sim is decoupled and seeded:

- Determinism: same seed + input script ⇒ identical standings (guards every perf change in §6).
- Invariants over a simulated race: ranks are a permutation of 1..8, `totalProgress` is monotonic, a finished racer stays finished, balloon count never goes negative in battle.
- Regression fixtures: record a known race, store its finish order, fail if it changes unexpectedly.

### D4. e2e hardening — keep, tighten

- Add a build-output e2e (run against `vite preview` of the production build, not just dev) so the shipped bundle is exercised.
- Keep `tests/diag.spec.ts` but move it out of the default `test` run (it is a manual screenshot tool, not an assertion).
- Consider raising Playwright `workers` once tests are independent; today `fullyParallel: false` is a correctness crutch.

### Acceptance criteria (Workstream D)

- `npm test` runs unit + data-integrity tests in < 5 s locally and in CI.
- Line coverage on `Stats.ts`, `util.ts`, `TrackGeometry.ts`, `SaveSystem.ts` ≥ 80%.
- e2e suite split from unit suite (`npm run test:e2e` vs `npm test`).

## 9. Workstream E: Build and CI hygiene

### E1. Fix the red build — HIGH, do immediately

`Save.viewMode` returns `ViewSetting = "m7" | "rotate" | "north"` (`src/systems/SaveSystem.ts:6`,`:194`), but `ThreeView` dropped the `"north"` mode (`VIEW_CYCLE = ["m7", "rotate"]`, `src/systems/ThreeView.ts:19`). Passing it to the `ThreeView` constructor fails `tsc` (`src/scenes/RaceScene.ts:106`). The Playwright tests miss it because they run the dev server (esbuild transpile, no typecheck).

Fix: drop `"north"` from `ViewSetting` and migrate any saved `"north"` to `"rotate"` on load (the load path at `:194-197` already sanitizes). Then `npm run build` is green.

### E2. CI gate — HIGH

Add a CI workflow that runs `tsc --noEmit`, the unit/data tests, the production build, and the e2e smoke suite on every PR. This is what keeps E1 from regressing.

### E3. Tighten TypeScript — MED

`noUnusedLocals` and `noUnusedParameters` are off (`tsconfig.json:14-15`). The dead code in §A10 exists partly because of this. Turn them on after the cleanup, or run a lint pass.

### E4. Bundle awareness — LOW

Phaser + Three is a large bundle (`chunkSizeWarningLimit` is bumped to 2200, `vite.config.ts:6`). Record the gzipped size in CI and watch it. Consider trimming unused Three modules.

## 10. Milestones and phasing

Ordered so each phase ships value and de-risks the next.

### Phase 0 — Unblock (0.5–1 day)

- E1 fix the red build.
- E2 minimal CI gate (typecheck + build).
- D1 set up Vitest and write the first `util.ts` / `Stats.ts` tests.
- §11 perf harness scaffolding (FPS + `renderer.info` + sim-step timing readout).

Exit: build green in CI, a handful of unit tests run, baseline perf numbers recorded.

### Phase 1 — Cheap perf wins, no refactor (2–4 days)

- A1 ground-height projection hints, A2 double-project, A3 camera matrix throttle.
- A6 flock birds as billboards, A10 dead code.
- B1 out-param projection, B3 shot hints, B5 feature buckets, B6 in-place rank sort, B7 small churn.
- D2 data-integrity tests.

Exit: measurable allocation drop and FPS improvement; data invariants locked.

### Phase 2 — Rendering throughput (3–5 days)

- A4 rig pooling + shared materials, A5 instancing for scenery and shadows, A7 pooled `BillOpts`, A8 renderer settings + quality toggle, A9 ground overlay.

Exit: draw-call target met; 60 fps under combat load.

### Phase 3 — The keystone refactor (1–2 weeks)

- C1 single seeded RNG, C2 sim/render decoupling via an event queue, C3 headless step API.
- D3 headless simulation tests + determinism fixtures.
- B2/B4 broad-phase and `aiCtx` buffer reuse (safer once sim is isolated and test-guarded).

Exit: sim runs headless and deterministically; full test pyramid in CI.

### Phase 4 — Polish (ongoing)

- E3 stricter TS, E4 bundle tracking, D4 e2e against the production build, parallel Playwright workers.

## 11. Metrics and measurement

You cannot optimize what you cannot see. Build the harness in Phase 0.

- **FPS overlay (exists).** `HudScene` already reads `game.loop.actualFps` behind the `overlay` cheat (`src/scenes/HudScene.ts:345`). Extend it with: Three.js `renderer.info.render.calls` and `.triangles`, sim-step ms, render ms, and live `MonRig` build count.
- **Headless sim timing.** After Workstream C, time `race.step()` over a fixed seed and frame count in a Node benchmark. This isolates sim cost from render cost.
- **Allocation profile.** Use the Chrome DevTools allocation timeline on a 10-second race. Target: flat sawtooth, no per-frame allocation spikes. Re-check after each Phase 1/2 change.
- **Draw calls.** Record `renderer.info.render.calls` at a fixed scene (track 0, 8 racers, post-countdown). This is the single best proxy for render cost here.
- **Bundle size.** Record gzipped `dist` size in CI.

Suggested target table (fill the "before" column from Phase 0):

| Metric | Before | Target |
|---|---|---|
| Chase-view FPS, 8 racers idle | TBD | 60 |
| Chase-view FPS, combat burst | TBD | ≥ 55 |
| Draw calls / frame (fixed scene) | TBD | ≥ 50% reduction |
| Per-frame heap alloc (steady state) | TBD | ~0 |
| Sim step ms (8 racers, headless) | TBD | < 2 ms |
| Unit + data test runtime | n/a | < 5 s |
| `npm run build` | red | green, CI-gated |

## 12. Risks and open questions

### Risks

- **Behavior drift during perf work.** Out-params and pooling can introduce aliasing bugs (two callers sharing one struct). Mitigation: land the determinism replay test (C1/D3) early; in Phase 1, prefer changes that are easy to verify and add targeted assertions.
- **Decoupling scope creep.** Workstream C touches the largest, most central files. Mitigation: do it incrementally (events queue first, GameObjects out last), keep the e2e smoke tests green at every step.
- **Instancing vs per-object tint/animation.** Rigs animate per-racer and tint on status; naive instancing breaks that. Mitigation: pool rigs (share geometry + material palette) rather than fully instancing animated models; reserve `InstancedMesh` for static scenery and shadows.
- **Headless WebGL.** Three.js objects assume a GL context. Mitigation: the sim core must not import Three at all (enforced by a test); only the presentation layer touches GL.

### Open questions

1. Target hardware floor for the 60 fps goal (which integrated GPU / browser)? This sets how aggressive A8 needs to be.
2. Do we want a user-facing quality setting (low/med/high) for AA, particle caps, and scenery density, or auto-detect from measured FPS?
3. Is `"north"` view a feature we want back, or is dropping it (E1) the intended end state? The README still mentions a "north-up" view.
4. Test runner preference: Vitest (recommended, shares Vite) versus node:test. Any constraint here?
5. How deterministic do we need cosmetic effects to be? Proposal: gameplay RNG seeded, cosmetic RNG free, so visuals never change outcomes.

## Appendix: file reference index

| File | Lines | Role | Key issues |
|---|---|---|---|
| `src/scenes/RaceScene.ts` | 832 | Main loop / wiring | aiCtx spread `:321`; O(n²) collide `:335`; build-breaking call `:106` |
| `src/systems/ThreeView.ts` | 952 | 3D renderer | `groundH` no-hint `:287`,`:586`; camera matrix `:521`,`:526`; rig per bill `:647`; AA `:257` |
| `src/systems/monmodel.ts` | 1810 | Procedural 3D models | per-rig materials `:56-67`,`:1763`; dead code `:15`,`:1776` |
| `src/race/Racer.ts` | 1110 | Physics + view (coupled) | Phaser/audio/fx imports `:1-10`; GameObjects `:131-133`; submit opts `:996-1041` |
| `src/systems/TrackGeometry.ts` | 308 | Spline + projection | allocs in `sample`/`posOf`/`project` `:171-228`; `featuresNear` `:242` |
| `src/race/ItemManager.ts` | 1053 | Items / projectiles | entity×racer loops; `find`/`reduce` per update `:210`,`:223` |
| `src/race/MoveManager.ts` | 715 | Signature moves | `updateShots` no-hint project; zone×racer maps |
| `src/race/HazardManager.ts` | 609 | Hazards | hazard×racer loops; `avoidPoints` alloc |
| `src/race/AIDriver.ts` | 191 | Race AI | `featuresNear().reverse()` per frame `:79` |
| `src/systems/Scenery.ts` | 540 | Roadside props | no instancing `:124-142`; flock rigs `:316` |
| `src/race/RaceDirector.ts` | 66 | Standings | sort-copy per frame `:19` |
| `src/systems/Stats.ts` | 122 | Pure stat/type math | testable now, untested |
| `src/util.ts` | 65 | Pure helpers + `Rng` | testable now, untested |
| `src/systems/SaveSystem.ts` | 203 | Persistence | `"north"` type mismatch `:6`,`:194` |
