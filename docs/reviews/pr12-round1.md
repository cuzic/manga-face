# manga-face PR #12 round 1 (head baa57cc2)

Verdict: **no Blocker, 1 Major (test gap in the gate), several Minor/Nit. Converges after the Major is fixed.** The look items are for the owner's checkpoint 1, not code defects.

## Reproduction (all ok)
- typecheck, lint, test (63 pass), golden (match) all pass.
- `pnpm measure --check` in Chromium reproduces Codex's numbers exactly:
  1 min 6.055 (mature/dark/black, neutral/smile); 2 min 3.957 (mature/brown/black) and seed 49 4.419; 3 worst ratio 0.622 (seed 2);
  5 feature pixels min 89.61% (brown-blond/laugh), total 97.37%, control min 3.44% / total 80.22% (fails as intended);
  6 hair/face 1070/1238/971 px, face/neck 152/159/157 px.
- Mutations on the gate (mine): `judge` 2 using only `random` -> caught; 3 `0.5*median` -> `0.5*min` -> caught; **3 restricted to showcase only -> NOT caught (Major below)**.
- Seeds 0-99 fixtures unchanged; only the 3 reference-manifest hashes changed (rendering changed, explained by U2).
- Purity ok: no node:/Math trig/Date in src; `src/features.ts` is a 4-line re-export shim (face.ts, manifest.ts, validate.ts untouched and still import from it). No leaks: no paths/tokens/names in the diff; commit author emails match the existing main authors; no out/, .codex, .pnpmfile.

## Findings

### Major
M1. `test/measure-check.test.ts:30-34` (gate 3 test) only exercises the showcase list. Mutating `tools/measure-check.ts:35` to `const relative = [...showcase]` (dropping random and palette people from criterion 3) passes all 4 tests. The relative floor for the 64 random + 24 palette people is the point of Q10 3 (finds a single collapsed pair on those populations) and is unguarded.
Fix: add a case where showcase is fine but `random: [person('0', 3.6, 8)]` (ratio 0.45, above 3.5) and one with `extremes: [person('x', 3.6, 8)]` must make criterion 3 fail. I confirmed the mutation survives; add the tests and re-run it to confirm it is killed.

### Minor
m1. `tools/measure.ts` (pixel gate 5/6, ~l.150-200): the threshold logic (`pixelPass`, 85%/95%, control must fail, 100 px) is inline in the Chromium-only function and untested outside CI. Extract a pure `judgePixels(features, control, keyChanges)` into `measure-check.ts` with a unit test, as was done for 1-4.
m2. Gate 5 grid is only `CHARACTERS.a` (young, short hair, non-mirrored) x skin 6 x hair {black, blond, navy}. Brown/chestnut hair (also keyed, ink 1.4/2.2:1), bob hair (b) and mature are not covered by the pixel check, although the hair-side brow keyline depends on the hair shape (locks differ). It meets Issue text (skin 6 x hair 3), but ADR D7 wants the check to catch a missing keyline; consider adding bob + brown as extra cases (non-gating report at least).
m3. `measure --check` gates only 1-6. Other D7 machine checks computed in the same run (anchors `ok`/`atLeast23`, min stroke `ok`, `chromiumIdentical`, comic verdict, swap `regressions`, sampler validity) are written to measurements.json but do not fail the job, and `continue-on-error` was removed so CI now looks like it gates D7 fully. Not in the Issue scope; either gate them (small) or say so in the README/PR so nobody assumes it.
m4. ADR not updated: ADR 0001 line 3 status and "weak spot 2" (l.83) still describe the bracket issue as open; D3 table numbers differ from the code (smile hMul 0.72 vs 0.78 in the table, sad lid 0.52 vs 0.6, tilt/irisMul extras). AGENTS.md requires the ADR state line/README to follow behaviour changes. Fix: one-line status update (U2 implemented pending owner checkpoint 1) and sync the D3 numbers.
m5. `src/brows.ts` `TRIG[Math.round(bp.angle) + 45] ?? [1, 0]` silently falls back to angle 0 when |angle| > 45. Pre-existing, but it is a hidden failure; throw instead (presets are static, so it can never fire legitimately).
m6. The blind kit: the 8 cards of a person are a permutation (each name exactly once), and the page does not say so. A rater can use elimination, which weakens "independent naming". Either draw each card's expression independently (seeded), or state in the page that every name appears once and accept that. The CI artifact `stage-review` also ships `blind-key.json` next to `blind.html`; fine for the owner, but the independent rater must not receive it (note in the README or tools/blind.ts header). No test exists for blind.ts (key order matches cards by construction; I checked the HTML contains no expression labels beside the button list).
m7. `src/fragment.ts` new clip ids `bk` (and existing `kc`, `fc`, `nk`, `lk`) are fixed strings; fine with `prefixIds`, but nothing tests that two faces in one SVG (stage.svg does it, and it renders correctly) keep unique ids. Optional test: `prefixIds` result has no duplicate ids across two fragments.

### Nit
n1. `tools/brow-comparison.ts` uses `current.prefixIds` for the baseline fragment (works, but reads like a mistake).
n2. `.github/workflows/test.yml` `fetch-depth: 0` is only needed for `git archive $PR_BASE`; a shallow fetch of the base would do. Harmless.
n3. Test fixture renamed `before-split.json` -> `face-snapshots.json` mixes a pure rename with changed hashes in the diff; fine, but mention in the PR body (the hashes changed there, the seeds did not).

## Spec conformance (Issue #2 + Q10)
- Split into eyes/brows/mouths/presets, content moved: ok. `cross` now `>` on the left eye (inner vertex), lash +11, half lid 0.45: ok and tested. 8 presets ok; relative widths test ok (hMul, wMul on base).
- Brow keyline: clipped to hair mass union locks (`hair.lockStroke`, test pins the clipPath content to the hair path), 8.6 wide, only if `needsKeyline(hair)`; blond has none; dark-skin underlay on brows is 1.5 + 4 = 5.5 (brow ink stroke + 4), nose/mouth w + 4 (test pins them). Deterministic (golden byte-identical, same bytes as CI).
- Gates: 0.5 x median, 3.5 absolute, 85% / 95%, 100 px: implemented as specified; worst-case selection correct (`lowest` over random and over extremes; stage.svg rows and blind targets match the Issue list: young a/b, mature dark/black, worst random seed 49, worst palette mature/brown/black).
- Gate 1 margin is thin: 6.055 vs 6 (0.9%). With `smile` squint 0 it drops to 5.695 (the PR's own mutation), so it is sensitive but fine; Chromium is version-pinned (playwright 1.62.1). A Chromium bump can move this by a few hundredths; note for later.
- Blind check itself (a human scoring >= 7/8) has of course not been run; it is the owner's part.
- Goldens: 6 files. young-short-neutral diff is only the brow keyline (5.5 unclipped -> 8.6 clipped, clipPath added); young-bob-smile diff is eyes/brows shape (smile preset: eye height, tilt, squint, brow angle). Everything is explained by U2; nothing else changed.

## Look at stage scale (for the owner's checkpoint 1; not a code verdict)
Stage PNG (1x and 2x rows, 6 characters): /tmp/claude-1002/-home-cuzic/af600e33-cecf-46a2-8d6d-e495e552245b/scratchpad/mf-pr12-stage.png
Brow crops (3x): .../mf-pr12-brows-before.png and .../mf-pr12-brows-after.png (same dir).
- The "bracket merging with fringe" is largely fixed: the white edge now follows the hair and no longer connects to the fringe outline on neutral. 
- What remains for the owner to judge: on black hair, raised brows that sit fully inside the hair (young b surprise left brow, **think left brow**) read as a white outlined pill / hairpin, since ink brow on ink hair is only visible by the paper halo. This is the "sticker" look ADR D4 accepted, now thicker (8.6). Think's raised brow (raise 26) is the most conspicuous.
- Small artifact: young b surprise right brow has a tiny white triangle in the notch where the brow halo meets a fringe tip (visible at 3x, subtle at 1x). Think right brow now sits half on the fringe edge and mostly loses its halo (reads fine because skin is below).
- Dark skin: keyline "doodle" outlines on brows/nose/mouth are visible at 1x (mature/dark/black row); legible but busy.
- Expression reading at 1x: laugh, surprise, angry, sad, think (asymmetric eyes) clearly separate. Closest pairs by the numbers: smile/neutral (6.06 on dark/black), smile/laugh (3.96 on mature brown/black); worry vs sad looks close in mouth size at 1x, separated by eyes (lid).
