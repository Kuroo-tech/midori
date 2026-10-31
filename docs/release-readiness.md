# Release readiness

Status: **not yet release-cleared**. The production build and automated suites pass,
and selected offline/recovery paths have evidence. A clean Git checkout and remote
CI run could not be established because this workspace has no `.git` metadata.
Content provenance/licensing also remains unverified; distribution of bundled
content must wait for review.

## Reproducible local gate

Required toolchain: Node.js `22.23.1`, npm `10.9.8`, Rust/Cargo `1.96.0`,
`wasm32-unknown-unknown`, `wasm-pack 0.15.0`. The observed environment for the
baseline was Fedora Linux x86_64, kernel `7.2.9-301.fc45.x86_64`, Vite `7.3.7`,
Svelte `5.57.2`.

On a clean checkout:

```bash
npm ci
rustup target add wasm32-unknown-unknown
cargo install wasm-pack --version 0.15.0 --locked
npm run generate
npm run check
npm run build
npm run content:audit
```

Run `npm run benchmark:core` after generation when checking core performance. It
uses only existing Node/WASM code and adds no package dependency. Release builds
must come from `npm run build`, not a dev server.

## Measured baseline and provisional guardrails

Baseline captured 2026-10-13 on the toolchain above. A warmed local production build
(`npm run build`, Rust artifacts already cached) took 4.34 s wall time; Vite's
reported client build was 1.32 s. These are workstation build times, not user
startup targets.

After the screen-persistence change, the final `npm run check` took 4.53 s wall
time and the final `npm run build` took 3.65 s wall time (Vite reported 1.10 s).
Build caches were warm in both observations; timing variation is not evidence of a
build-speed improvement.

Initial pre-change output and final output after the screen-persistence warning change:

| Budget item | Measured | Provisional release ceiling |
|---|---:|---:|
| WASM raw | 232.66 kB | 250 kB |
| JS entry raw / gzip | 159.24 → 160.17 / 51.99 → 52.18 kB | 175 / 58 kB |
| CSS raw / gzip | 28.27 → 28.49 / 5.89 → 5.93 kB | 35 / 8 kB |
| Initial listed resources raw / gzip | 426.88 → 428.03 / 156.06 → 156.29 kB | 450 / 165 kB |
| Workbox precache | 9 entries / 431.39 → 432.51 KiB | 470 KiB |

These ceilings provide roughly 5–10% regression room over the measured build; they
are **manual guardrails**, not user-derived latency requirements or CI-enforced
budgets. Revisit them when content size, supported devices, and performance
requirements are defined. Precache intentionally excludes `/data/content/**`. The
small size increase is observed after this phase's code edits; this comparison does
not isolate each edit's contribution.

Core benchmark (`npm run benchmark:core`): Linux x64, Node 22.23.1; 3 warmups +
15 measured samples per size. Before-edit / after-edit results:
`cardsFilter` includes JS JSON serialization, WASM boundary,
Rust deserialization/filter/lesson summary and response decoding. `deckParse` uses a
representative JSON package, excludes file reading and IndexedDB writes. p95 with
15 samples is indicative only (nearest-rank, effectively near the maximum).

| Operation | Cards / payload | Before median / p95 | Final median / p95 |
|---|---:|---:|---:|
| Search filter | 1,000 | 7.12 / 12.37 ms | 7.75 / 10.42 ms |
| Search filter | 10,000 | 64.95 / 75.26 ms | 75.81 / 78.99 ms |
| Search filter | 50,000 | 325.10 / 332.82 ms | 328.00 / 343.37 ms |
| JSON package parse | 1,000 / 0.14 MiB | 4.42 / 6.45 ms | 4.77 / 5.66 ms |
| JSON package parse | 10,000 / 1.46 MiB | 41.98 / 45.27 ms | 44.89 / 50.74 ms |
| JSON package parse | 50,000 / 7.37 MiB | 206.02 / 209.03 ms | 203.78 / 211.02 ms |

This measures synthetic workloads; the current published library has 36 cards.
The paired runs are not a controlled benchmark comparison (host load varies), so
the observed differences cannot be attributed to the small UI/persistence changes.
Linear full-library filtering is not established as a current bottleneck, and no
algorithm/storage optimization is justified by these runs.

Production Chromium smoke on Linux/Electron (`Chrome/150.0.7871.250`), preview at
`127.0.0.1`, same app build, 7 cold site-data/cache-cleared launches and 15 reloads:

| Startup-to-navigation-visible | n | Median | p95 |
|---|---:|---:|---:|
| Cold (origin storage and browser cache cleared before each launch) | 7 | 133 ms | 142 ms |
| Warm reload | 15 | 99 ms | 143 ms |

These startup samples used the pre-screen-persistence-fix application build; no
browser startup retest was made after the final build.

The endpoint was visibility of the primary navigation, not a formal input-latency
or first-paint metric. Browser resource entries in one cold sample reported JS
52,285 B transferred / 159,236 B decoded, CSS 6,190 / 28,270 B, WASM 232,961 /
232,661 B, Workbox 2,658 / 5,748 B, and `version.json` 366 / 66 B. Local preview
does not represent a real network. No long tasks were observed in these samples;
this is not evidence for constrained CPUs. `navigator.connection` reported 3g-like
values, so network characteristics were not treated as a controlled condition.
JS parse/execute and browser WASM compile/init were not isolated by this timing.
One Node `loadCoreFrom(bytes)` initialization observation was 44.66 ms; it is not a
median and does not include browser download. The final benchmark's single
initialization observation was 43.49 ms; these two observations are not a
before/after performance claim.

To repeat the startup proxy, build and serve production output with `npm run build`
and `npm run preview -- --port 4181`. In the same Chromium automation host, measure
navigation start through visibility of `nav[aria-label="Điều hướng chính"]`. For
cold samples, clear site data, Cache Storage and browser cache before each new
launch; for warm samples, reload the same installed origin. Keep CPU/network
throttling unchanged and record browser version and sample count. This is a manual
automation-host procedure, not a committed browser benchmark; no browser automation
dependency was added.

### Not measured / hypotheses

- Peak memory and per-operation allocation: no reliable browser memory profiler was
  used.
- Browser JavaScript parse/execute, WASM download versus compile versus init, and
  time-to-first-interaction: not separated by the available sample.
- IndexedDB write time and full import/restore duration: the core parse benchmark
  deliberately excludes file read, validation pipeline overhead outside Rust, and
  IndexedDB transactions.
- Study transition, session restoration, and rating latency: functional behavior
  was tested, but no timed user-interaction benchmark was run.
- **Hypothesis only:** filtering very large libraries may become interaction-blocking;
  synthetic 50k-card filtering is measurable, but the real library has 36 cards and
  no target-device latency budget exists. Do not add workers/virtualization based on
  that hypothesis alone.

## Recovery and offline evidence

Automated coverage currently includes:

- `tests/storage-recovery.test.ts`: invalid-record quarantine, injected recovery
  store failure aborting without deleting original, failed restore and content
  reconciliation retaining old data, and backup restoration of SRS/session/meta.
- `tests/backup.test.ts`: versioned round-trip with/without progress, malformed
  schema and invalid input rejection before commit.
- `tests/content-pipeline.test.ts`: offline/network failure, corrupt/hash-mismatched
  packages, unsupported schema, failed staging/promotion, and retry-safe active
  content preservation.
- `tests/session-storage.test.ts`: failed session and screen persistence surfaced
  as failure signals; session normalization/legacy compatibility.
- Final-build Chromium preview smoke at `localhost:4182`: patched
  `IDBObjectStore.put` to throw `QuotaExceededError` only for `meta/screen`, clicked
  the Học navigation, and confirmed navigation still completed, a dismissible
  `role="alert"` appeared, and the original error was logged. This is deterministic
  failure injection, not a real quota-exhaustion test.

Tests use deterministic failure injection and `fake-indexeddb`; they do not simulate
real disk quota exhaustion, power loss, or every browser's transaction scheduling.
Restore replaces the user library in one transaction. Content-package activation
and learner-library reconciliation are distinct transactions: a reconciliation
failure leaves the content package activated but retains the prior learner cards
and reports a retryable sync error; it does not claim a cross-database rollback.

Earlier production-preview evidence is recorded in
[`verification.md`](verification.md): first-run/offline launch, refresh while
offline, content update preserving SRS, app update, cache-eviction recovery, backup
and interrupted-session paths. Phase 4 additionally refreshed the app while
Chromium network emulation was offline on an origin whose service worker already
controlled the page; the Home screen and library rendered. This was not a new
physical-device test or a new app-version update test. This offline reload preceded
the final screen-persistence change; no final-build browser rerun was made.

## Release checklist

### Before candidate build

- [ ] Review and record provenance/license for every bundled content package.
- [ ] Build from a clean checkout with the pinned tools; record CI run and commit.
- [ ] `npm ci`, `npm run generate`, `npm run check`, `npm run build`, and
  `npm run content:audit` all pass.
- [ ] Compare asset sizes with the provisional ceilings above; investigate any
  increase rather than accepting it as an optimization/regression without evidence.
- [ ] Confirm 131 Rust and 106 JS/TS tests from the current run; refresh counts if
  tests change.
- [ ] Production smoke: first visit, reload, due/weak study, card rating, backup
  with/without progress, invalid backup, and recovery export.
- [ ] Production smoke: offline refresh/navigation after successful install;
  app-shell update waiting/acceptance; content update and hash failure preserve
  usable prior content; verify user SRS remains intact.
- [ ] Confirm **both** CI jobs are green. `verify` runs `npm run check` and the
  production build; `layout` runs in parallel (no `needs: verify`) and ends with
  `npm run audit:layout`, failing on any violation: 0 violations across 10
  viewports × 11 screen states, the swipe probe on the import/export screen, and
  110 geometry snapshots compared against the committed
  `scripts/layout-baseline.json` (6px tolerance). The audit covers horizontal
  overflow, clipped text, small touch targets, elements behind the fixed nav,
  buttons unreachable at the bottom of the page, the swipe gesture's selected
  section + slide direction, and per-element drift of the layout skeleton. It
  does not cover keyboard focus order, real touch delivery, or real hardware.
  The `layout` job pins Noto Sans via fontconfig (`assign_replace`, then a
  `fc-match` self-check) because the baseline was captured in that font: the
  runner image ships no `fonts-*` package beyond emoji, and substituting the
  Latin family moves 46/110 states. Missing CJK fonts do **not** move it —
  measured by swapping the kana/kanji font (Droid Sans Fallback → Noto Serif CJK
  JP), 0 drift, since unitless `line-height` makes line height font-independent
  and every CJK family gives each glyph a 1em advance. Read a text-overflow
  failure before trusting it, but expect a geometry failure there to mean a
  broken pin, not a font that needs adding.
- [ ] The `layout` job also compares **screenshots** of every screen state at **all ten
  viewports** against the committed `scripts/layout-shots/` (110 WebP images, 2.87 MB,
  stored at half resolution) plus `scripts/layout-shots.json`, which records the format,
  downscale, thresholds, per-file sha256 and the renderer fingerprint that produced
  them. The comparison has two regions. Outside text: a pixel drifts when one channel
  differs by more than 20/255 and the state fails above 0.1% of the image. Inside text
  (text-node boxes read from the live DOM, 2px halo): blocks of 4×4 are compared by
  **three** measures — block mean (12/255), **ink colour** (12/255) and the **chromatic
  spread of the ink** (80/255, the gap between the most and least shifted channel) —
  and the state fails when more than **40% of the text area** drifts or when at least
  **4 blocks** show a chromatic shift. Every threshold is measured, not assumed.
  Rerunning all 110 states with `--disable-font-subpixel-positioning` (Chrome draws
  glyphs differently, the way a Chrome-version difference would) left **0 pixels**
  outside text everywhere and keeps **110/110 states green**; the text area still drifts
  there, most at the dense Stats screen (28.4% at 820×1180), which is why the budget
  sits at 40% — at the earlier 25% those two Stats states failed on the rasterizer
  difference alone. Two measured facts shape the ink measures: rasterizer noise moved
  ink colour by up to **118/255**, *more* than a real text-colour change (103/255), so
  magnitude alone cannot separate them; and the **direction** of the shift can — glyph
  coverage is a lightness effect that moves all three channels together, while a colour
  change moves them apart (56/255 chromatic spread for noise, 120/255 for the real
  change, and 0 blocks over 80/255 across all 110 noisy images versus 15–340 blocks for
  the colourful one; block maxima are recorded unconditionally, so those numbers are
  readable straight out of a run instead of only when a threshold has already fired). Coherent consequences: a `--text` token change reddens
  110/110 states, while an achromatic `--muted` lightening of 60/255 reddens only the
  16/110 states whose screens carry a lot of muted text — a text-only change that stays
  under 40% of the text area and does not shift chroma is deliberately tolerated.
  Three conditions are pinned inside the script and matter more
  here than for geometry: the colour scheme (the app picks light/dark through
  `matchMedia`), the motion state (`midori-rise` uses `backwards`, so capturing
  mid-animation moved coordinates by 7–8px and thousands of pixels), and the downscale
  itself (computed by the script's own block sums, never by the browser's resampling
  filter, which can change between versions). Refresh with `LAYOUT_UPDATE_SHOTS=1`
  (separate from the geometry baseline, which is `LAYOUT_UPDATE_BASELINE=1`) and commit
  both `scripts/layout-shots/` and `scripts/layout-shots.json`. Two self-checks make
  the storage choice safe rather than optimistic: on every refresh the freshly written
  file is compared against the block data it came from and the refresh FAILS if even one
  level differs (Chrome's default WebP drifts up to 61/255, so "WebP is lossless" was
  not something to assume), and on every comparison run each baseline file's sha256 is
  checked against the manifest. A mistyped viewport id (or an empty list) fails the run
  immediately with the valid ids instead of silently comparing nothing.
- [ ] To tell "the code changed" from "this machine draws differently", run
  `npm run audit:multi-env` (two renderer profiles, see `LAYOUT_RENDERER_PROFILES`): it
  labels each violation **real** when at least two environments see it and
  **environment-specific** when only one does, and prints each environment's
  **in-environment noise floor** (`LAYOUT_NOISE_RUNS`, two recaptures per state by
  default; 0/255 over 220 recapture comparisons per environment on the full 110-state
  run, i.e. the thresholds have their full margin). A full run here reports 0 violations
  for the default profile and 2 for the subpixel profile, both labelled
  environment-specific — which is the point: the tool names the cause instead of leaving
  you to guess from a pixel count. It exits non-zero while any environment reports a
  violation (a diagnostic, not a way to make the pipeline green), and its
  per-environment reports and logs go to `layout-multi-env/` (gitignored). If the target
  environment genuinely cannot be reproduced, the documented last resort is to raise
  `LAYOUT_SHOT_TEXT_BUDGET` after measuring with the runner — never before, and never
  silently.
- [ ] Understand what the `layout` job caches: `dist/` only, keyed on a hash of the
  build inputs (sources, `content/`, build config, Rust lock/toolchain pins) computed
  right after checkout; restored with `actions/cache/restore`, saved with
  `actions/cache/save` **only after a green audit**. On a hit the job skips Rust,
  wasm-pack, `npm run generate` and the build, and goes straight to measuring. If a
  run ever seems to audit stale output, inspect the `Hash the sources that produce
  dist` step first. CI records the audit's machine-readable report as
  `layout-report.json` (`LAYOUT_REPORT_JSON`) and uploads it with the diff images when
  the job fails, so a red run says which renderer produced it and how noisy that
  renderer is.
- [ ] Note what the first real run must still prove: the workflow itself has
  never executed on a GitHub runner (verified here by running its `run` blocks
  locally), the `apt`/`sudo` font step only had its logic exercised against
  stubs, and the baselines were captured on Chrome 155 while the runner image
  ships Chrome 154. Pixel baselines are the most exposed to that gap, and the audit
  now separates the two ways it can show up, so read the failure before touching any
  tolerance: violations in the **text region** carry a percentage of the text area
  (`X% vùng chữ lệch`) and, when the ink metrics fired, their deltas — a share only
  just above 40% with an ink delta of tens and no chromatic shift is the renderer gap,
  not the code, and the fix is to regenerate the baseline in a runner-like environment
  (or reproduce locally with `npm run audit:multi-env` plus a Chrome 154 binary via
  `LAYOUT_RENDERER_PROFILES`), never to raise `LAYOUT_SHOT_TEXT_BUDGET`. Violations
  **outside text** (`X pixel NGOÀI vùng chữ lệch`) with large deltas are real colour
  changes; a solid block of pixels is never renderer noise. For geometry,
  `geometry-baseline-missing`/`geometry-*` across every state points at the font pin,
  a handful of states at a Chrome-version or layout change, and a single state at a
  real layout change (refresh the baseline only if the change is intentional). The
  first run also exercises, for the first time on a runner, the 110-image comparison
  itself: expect ~80s for the audit step and check `shotDownscale`/`shotFormat` in the
  report match the committed manifest.
- [ ] Check desktop/phone viewport, keyboard path through reveal/rating, and
  reduced-motion behavior. Document unsupported browsers/devices.

### Deploy, verify, recover

- [ ] Deploy static production output with SPA fallback to `index.html` for the app
  shell. Root-path deployment is the verified setup; custom subpath hosting is not
  verified.
- [ ] Verify deployed `/data/version.json`, manifest and bundle hashes over HTTPS.
- [ ] Smoke a fresh install and one already-installed PWA after deployment.
- [ ] If application assets regress, redeploy the last known-good static artifact;
  the service worker prompts before switching, and user IndexedDB is separate.
- [ ] If a content package is invalid, leave/revert the published manifest/package;
  the client should retain active content and show a failure, then retry after
  correcting the package.
- [ ] For learner data recovery, use the personal backup or recovery-record export.
  Do not clear site data as a troubleshooting step without a verified backup.

## Compatibility and release gaps

Evidence is Chromium automation/preview only. Firefox, Safari/WebKit, installed
Android/iOS PWA, real-device performance, browser quota behavior, assistive
technology, and constrained CPU/network profiles remain untested. Browser-level
offline reload is tested; old-to-new cache replacement has prior manual evidence,
but should be repeated for each release candidate. The application has no client
router/deep-link contract; hosting fallback does not make nested screens directly
addressable. A remote CI run and clean-checkout reproduction remain required before
calling a release candidate ready.
