# PR #13 review (Opus, round 2)

Target: fix/u1-minors @ d63a2f2f1e6028bdbee1e4e1a3bec0fc89e90d37

## Conclusion
The merge of main (`cf5adb2`, U3 hair templates and R2-R4) keeps both sides' intent: `HAIR_TEMPLATES`/`pickTemplate` and the template checks from main, and the range-copy path, hair fallback, single NaN-strands report and extra purity checks from this PR. `GENERATOR` is 4 in a separate commit, the ADR D5 text says 4, the snapshots were regenerated, and goldens are byte-identical. The three mutations in the task spec all fail tests. converged: yes. One Minor test gap on the test-only `ranges` seam and one nit remain.

## Previous round
Round 1 had no findings. Its positive checks still hold after the merge:
- Range copy instead of mutating `RANGES` (n5): `test/params.test.ts` and the hair-fallback test pass ranges by value; no `Object.assign(RANGES, ...)` remains. Read.
- NaN strands reported once (n2): mutation removing the `Number.isFinite` guard in `validateWithRanges` fails 2 tests. Ran.
- Purity (n3): appending `export const T = [1, 2].map(x => x + 1);` to `src/hair.ts` (a file from main) fails the new side-effect test; `const g = performance;` fails the purity regex. Ran.
- Hair fallback (m1): replacing the fallback with the current value fails the brows and hair fallback tests. Ran.

## Task spec acceptance
- typecheck, lint, test (84), golden: pass locally at the head; CI (Node 22, 24, golden, chromium measure) all pass (`gh pr checks 13`).
- `GENERATOR = 3`: 4 tests fail (snapshots, brows repair, both fallbacks). Ran.
- `pickTemplate` fixed to `'short'`: snapshot test fails. Ran.
- No test removed relative to either merge parent (compared test names against `08d9354^1` and `08d9354^2`); the PR-side seed-13624 brows test was replaced by main's `CHARACTERS.a` form with a reseeded value, which is equivalent coverage.
- Seed sweep at GENERATOR 4, seeds 0-4999: first-draw valid 99.98% (one brows repair), templates evenly spread (wavy 1316, short 1264, long 1256, bob 1164), all valid. Ran.
- `normalizeWithRanges`, `validateWithRanges`, `ParameterRanges` and `repairCharacter` are not exported from `src/index.ts`, so the public surface is unchanged. No other open PR touches these files.

## Findings
### m1 (Minor): the `ranges` argument of `repairCharacter` is only pinned on the first normalize/validate; three mutations to the threading survive.
- Evidence: in `src/random.ts`, each of these survives `test/random.test.ts`, `split`, `validate`, `params` (35/35 pass): (a) redraw `drawGroup(seed, group, k, ch, RANGES)` instead of `ranges`; (b) fallback `normalizeWithRanges({...ch, [group]: fallback}, RANGES)`; (c) final `validateWithRanges(ch, RANGES)`. In the hair-fallback test the step-64 range makes the redraw snap identical either way and the default hair is valid under both ranges. No production impact: the public entry always passes `RANGES`.
- Fix: in the hair-fallback test, also assert something only the custom ranges produce (e.g. a range whose fallback value must be snapped by `ranges`, or a final-validation range that rejects a value `RANGES` accepts), or drop the seam from the steps the tests do not need.

### n1 (nit): ADR U5's "first-draw validity >= 99%" is not asserted by any test.
- Evidence: `grep firstDrawValid test/` finds only the single-case repair tests; the 5,000-seed test checks final validity only. Measured 99.98% at GENERATOR 4. Pre-existing on main, outside this spec's scope.
- Fix: count `randomCharacterDetailed(seed).firstDrawValid` in the existing 5,000-seed loop and assert >= 0.99 (later, in U5).

## Verdict
converged: yes (Blocker 0 / Major 0 / Minor 1 / nit 1)
