# manga-face PR #12 round 3 (head 212ef867)

Verdict: converged. No Blocker, no Major. Two Nits.

Checks: typecheck, lint, golden (match) pass; tests 76/76 pass. `measure --check` exit 0 and all rows PASS: 1 = 6.055 (unchanged margin), 5 = 89.58% / 97.79%, 1512/1512 cases for both the features and the control (control 0.00% / 80.65%).

## Items
- B1 leak: fixed in round1 doc. `git diff origin/main...HEAD | grep -E "/tmp/claude|/home/"` has one hit, in docs/reviews/pr12-round2.md:33, which quotes the grep pattern itself (the string "claude-1002" and "/home/" inside a recheck command, no real path, no session id). Searching the whole tree (docs, src, tools, test, .github, README) finds no real local path or session id. See Nit 1.
- Major (artifact split): `blind.html` is only in `blind-quiz`, created only when `BLIND_QUIZ_SEED` is set; `stage-review` = stage.svg + brows PNGs; the key is in no artifact. Workflow test mutations: blind.html added to stage-review, `out/*` in blind-quiz, `out/*.json` in measurements, whole `out` in stage-review: all killed (1 fail each).
- Seed: required argument (CLI test: none, empty, abc, -1, 1.5, 4294967296 all exit 1), not in the HTML (test: neither the number nor the word "seed"), only in the key. The page now checks `quizId` (sha256 of the card data), which reveals nothing about the order.
- Pixel grid: 1512 asserted for features and control, tested (252 fails both ways).
- Clip ids: all presets x 2 faces, `url(#)` and `href="#"` references, plus a synthetic mask/paint/href test.
- brows.ts: angle guard simplified, NaN and out of range throw, still tested.
- Docs: Chromium pin noted in workflow and ADR.

## Nits
1. `docs/reviews/pr12-round2.md:33` contains the literal "claude-1002" (pattern text). Harmless, but trim it to a generic "grep for local paths" so the diff grep is clean.
2. Mutation survivor: deleting `if: steps.blind.outputs.generated == 'true'` on the `blind-quiz` upload is not caught by `test/workflow.test.ts` (consequence is a failing job when no secret, since `if-no-files-found: error`; not a leak). Optionally assert the `if:` line in the test.
3. `FEATURE_GRID_CASES = 1512` is hardcoded: adding a hair colour or character will need an edit, which is the intent.
