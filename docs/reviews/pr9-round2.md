# manga-face PR #9 — adversarial review, round 2 (head 49c95a7)

## Verified (reproduced myself)
- typecheck, lint, test (50 pass), golden: green. `goldens/` has no diff against main.
- Byte identity vs origin/main (d50fcb7): a harness ran on both trees and gave the same SHA-256 (8079ab6d...).
  It covered 200 seeds (numeric 0..99 and 'x0'..'x99') with `randomCharacterDetailed`, the reference characters, and `normalize`, `validate` messages, every fragment (8 + 6 extra expressions) and `toManifest` for each.
  It also covered 1500 off-step fuzz characters and the DIRECTIONS / PRESETS / defaultCharacter outputs.
  A further run of `randomCharacterDetailed` for seeds 0..79999 (7 take the repair path) is identical too (48c9ae55...).
- Mutations: 34 mutants, each run on its own copy of the tree with the full suite.
  - M1: repair loop off (`k <= 0`), fallback loop off, final throw off, no re-validate after the fallback, redraw stream k fixed to 0: all killed.
  - M2: all 15 round-1 survivors are now killed (mouth.w line, jaw loop, cheek loop, mouth.y lower bound, `selfIntersects` i+3, head-circle, hair-self-intersect, mouth-reaches-chin, eyes-touch, brow-outside-head, mouth-anchor, mouth-near-eyes, `Number.isInteger`, palette early return, toManifest normalize, faceFragment normalize).
  - Also killed: mouth-outside-face, eye-outside-face, face-self-intersect, brow-into-eye, strands `< 1`, the epsilon removed or widened to 1e-2, the finite check removed, brow-group forced to always `brows` or always `eyes`, the `validateRaw` export removed.
- Minors: float tolerance (1e-9) is tested at both edges. NaN and the string '86' give `range` "must be a finite number" violations. `brow-into-eye` group attribution has a test for both the `eyes` and the `brows` case. README, ADR D2/D5 and AGENTS.md match the code. `validateRaw` is exported from `index.ts` and is documented in README and ADR.
- Aliasing: the fallback puts `HAIR_YOUNG` / `DIRECTIONS.young[g]` straight into the character, but `normalize` does `structuredClone`, so nothing is shared.
- Leaks: none in src, test, tools, README, AGENTS.md, the ADR diff or the review file (no paths, names or tokens).

## Findings

### Blocker
none.

### Major
none.

### Minor
- m1. `src/random.ts` (fallback, `group === 'hair' ? HAIR_YOUNG : ...`): the hair branch of the fallback is not covered. Mutant `group === 'hair' ? ch.hair` survives all 50 tests.
  The fallback test only drives `brows`. Fix: a `repairCharacter` case whose candidate has a hair that self-intersects through every redraw is hard to build, so either unit-test the fallback selection on a `hair` violation or record the branch as defensive (a hair violation is reachable only with a crafted input).
- m2. `test/random.test.ts`: 20,000-seed always-valid test makes the suite about 17 s. Acceptable, but 5,000 would do if CI time matters.

### Nit
- n1. `src/validate.ts` (`hasInvalidNumber` early return): the mutant that drops it survives. Non-finite values give no extra geometry violation, so today the early return is not observable. Keep it (it guards NaN geometry), or add a test that checks `validate` does not throw on NaN cheek with a normal palette (it currently asserts only strands NaN and the '86' case).
- n2. NaN strands is reported twice (`strands` and `range`). Fine, but the ADR does not say so.
- n3. `test/purity.test.ts`: regex adds `Date`, `Intl`, `toLocale*`, `toFixed`, but not `performance` / `globalThis`, and there is still no top-level side-effect check for `sideEffects:false`. Round-1 m1 is half done; optional.
- n4. `docs/adr/0001-manga-face.md` D5 line "PR #9 の U1 レビュー対応ではシードの出力を維持し、タスク仕様どおり世代 2 を使う。" is review-process text in a design record; a bare "U1 の分割では出力を変えないので GENERATOR は 2 のまま" would age better.
- n5. The tests that widen `RANGES` (cheek 100, chin 86) mutate a module global and restore it in `finally`. They are safe with node:test's per-file serial run, but would race if tests ever ran concurrently within a file.

## Verdict
**converged.** No Blocker or Major remains. M1 and M2 are fixed, with every requested mutation killed. The output is byte-identical to main, goldens are unchanged, and no leaks were found. Minors m1/m2 and the Nits are optional follow-ups.
