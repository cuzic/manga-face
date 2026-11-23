# manga-face PR #12 round 2 (head dec9ed29)

Verdict: NOT converged. 1 Blocker (leak, one-line fix) and 1 Major (blind-kit contamination via the CI artifact). All round-1 findings are fixed; nothing else new of weight.

## Reproduction
- typecheck, lint, golden (match) pass; test 71/71 pass. Goldens and test fixtures are unchanged since the round-1 commit.
- `pnpm measure --check` (Chromium), exit 0, 12 rows PASS:
  1 min 6.055 (mature/dark/black, neutral/smile): same margin as before (0.9%), not improved, not worse.
  2 min 3.957 / seed 49 4.419; 3 worst ratio 0.622 (seed 2).
  5 worst feature 89.58% (mf-b/brown/gray/surprise) vs 85 (margin 4.6 pt), total 97.79% vs 95 (2.8 pt); control worst 0.00%, total 80.65% (fails, as intended). Grid is 3 characters x 6 skins x 6 hairs x 14 expressions = 1512.
  6 hair/face 1070/1238/971, face/neck 152/159/157 (all > 100).
  Rows 6-11 (determinism, anchors 23.2/23.5, stroke 2.8 units = 1.008 px, sampler 1000/1000 + 0/540, comic, swap 0 regressions) pass. `process.exitCode = 1` on any failing row (measure.ts:305).
- Blind key: `blind-key.json` is written to out/ but the workflow's artifacts are `measurements` (measurements.json only), `gallery` (out/*.svg) and `stage-review` (stage.svg, blind.html, brows-*.png). The key is in none of them. blind.html contains no expression labels except the 8 button names and the `names` array (3 occurrences each, expected).

## Round-1 findings
- M1 fixed: tests for random and palette at ratio 0.45; my mutation (③ over showcase only) now fails 2 tests.
- m1 fixed: `judgePixels` is pure in measure-check.ts with tests (inclusive 0.85/0.95/100 px, control must fail).
- m2 fixed: bob, brown, chestnut, mature, 6 hairs, all skins.
- m3 fixed: gates 7-12 added, ADR/README say so.
- m4 fixed: status line, weak spot 2, D3 values (smile hMul 0.72, sad lid 0.52, plus tilt/irisMul/wMul 1.7) all match src/presets.ts.
- m5 fixed: RangeError for |angle| > 45 and NaN, tested incl. +-45 boundaries.
- m6 fixed in code: cards drawn with replacement, test pins the display-order key and that duplicates occur. But see M2 below.
- m7 fixed: clip-id uniqueness test (see Nit 2).
- n1 fixed. n2 and n3 (workflow fetch-depth, fixture rename note) unchanged; trivial.

## My mutations on the new gate code (unit tests, `node --test test/measure-check.test.ts test/measure-pixels.test.ts`)
All killed: ③ relative over showcase only (2 fail); drop `!passesContrast(control)`; FEATURE_MIN_FRACTION 0.85 -> 0.84; total floor 0.95 -> 0.94; ⑥ without faceNeck; ③ factor 0.5 -> 0.4; ② floor 3.5 -> 3.0 (1 fail each, 3 for the 0.4 one).
Survives (expected, inline in the Chromium-only function): restricting the grid to `hairs = ['black']` still passes all 71 tests. The grid composition (the very thing m2 asked for) is not asserted anywhere.

## Findings

### Blocker
B1. `docs/reviews/pr12-round1.md:44` (and the two crop paths on the lines after it) commits a local scratchpad path to a PUBLIC repo: `(reviewer's local scratch file)` (OS user dir name and a session id). It is my own round-1 text, not Codex's, but it is a leak in the diff and the rule is that leaks block. Fix: delete or replace those three lines with "(images kept outside the repo)" in an additional commit (history will still hold the earlier version; the owner decides whether that needs a rewrite, which is a low-sensitivity path, no token). Then recheck `grep -rn "claude-1002\|/home/" docs`.

### Major
M1. `.github/workflows/test.yml` `stage-review` artifact (last step) ships `blind.html` together with `stage.svg`. stage.svg has the same people (showcase 0, 1, 3 and both worst cases) at the same size with the expression name above every column, i.e. the answer sheet for the blind quiz. Whoever gets the artifact zip can match faces by sight, which defeats the point of the held-out worst cases. The key file is correctly absent, but this is an equivalent leak. The README only says "share blind.html".
Fix: upload `blind.html` as its own artifact (`blind-quiz`), keep stage.svg and brows PNGs in `stage-review`; say in the README to give the rater only `blind-quiz`.

### Minor
m1. `tools/blind.ts` embeds `key.seed !== 2075` in the page source and the repo is public, so a rater can regenerate the order by running `node tools/blind.ts` (needs measurements.json). Not exploitable by a casual rater. Fix: drop the seed check in the page (compare targets count and id only) or accept and note; low value.
m2. `tools/measure.ts` ~l.196 grid is not asserted (see mutation). Fix: have the `featurePixels` row's value or a pure check state `cases === 1512` (or `characters.length*skins.length*hairs.length*exprs.length`) and add `judgePixels` input `cases` with a floor test; or just a one-line test that imports the grid builder.
m3. Margin on ① is still 0.9% (6.055 vs 6) and depends on the Chromium pin (1.62.1). Unchanged since round 1; note in the PR that a playwright bump needs a re-measure. Not blocking.

### Nit
n1. `test/keyline.test.ts` clip test uses only `think`, and only `clip-path="url(#...)"` references (not `fill="url(#..)"`/mask). Fine today.
n2. `tools/blind.ts` header comment says "run measure --check first" but not "do not give blind-key.json to the rater"; README has it, repeat it in the header.
n3. TRIG check `!trig || angle < -45 || angle > 45` is redundant for `!trig`-only cases except NaN; fine, keep.

## Verdict
Not converged until B1 (remove local paths from docs/reviews/pr12-round1.md) and M1 (split the blind quiz artifact from stage.svg) are fixed. Both are tiny and neither touches rendering. Everything else (the 12 gates, margins, tests, ADR sync, goldens, key not shipped) checks out; after those two a round 3 can be a quick recheck, or converged by the coordinator's reading.
