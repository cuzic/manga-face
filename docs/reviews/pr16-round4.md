# PR #16 review (Opus, round 4)

Target: feat/r4-ai-landmarks @ a7a2ed30845cdc81c5a7bc057ebe7cdf693b8cd0

## Conclusion

All round-3 findings are fixed, and I confirmed each fix by running it. The round-3 M1 repro (a stale but self-consistent fixture set with the chin moved 30 px) is now refused before any adapter call. I re-applied every round-3 mutation and a sample of round-2 mutations, and all of them fail the suite. I could not get a stale, mixed or foreign-fixture report through `qualified_points`, and a genuinely current report is accepted. CI is green. Converged: yes. One Minor remains: unread fixtures are checked only after the paid calls. One nit concerns the stored metrics.

## Previous round

- M1 (report not bound to the fixtures read): **resolved**.
  - `checked_fixtures` requires the SVG and truth bytes to equal the current `generate()` output.
  - `truth_sha256` is computed from the files read.
  - The policy checks every reading's `svg_sha256`/`png_sha256`.
  - My independent repro is refused with "fixture is not what the current generator writes", and the adapter is called 0 times.
- m1 (OpenAI adapter contract untested): **resolved**. These mutations are killed: model check removed, null/reason loosened to `x is None or y is None`, image included in the configuration payload.
- m2 (calibration duplicate ID, zoom crop): **resolved**. Both mutations are killed: `if response_id in seen` → `if False`, and zoom of the whole sheet instead of the cell.
- n1 (PR body wording on `landmarks.ts`): **resolved**. The body points at ADR 0002 R5 / Issue #10.

## Findings

### m1 (Minor): A stale or missing fixture that the run does not read is detected only after the paid calls. The resulting refusal at fit time names the wrong cause, and the README says otherwise.
- Evidence (ran, scratch script, not committed):
  - `checked_fixtures` checks only the `cases` being read; the default is the 3 base cases.
  - `evaluate` calls `read_truth_files(fixtures)` after the calls. It reads and digests all 9 generated cases (`run_landmark_calibration.py:28-30, 108`).
  - Case 1: in a fresh directory, I overwrote `smile.truth.json` (an `--expanded`-only case) and ran a base calibration.
    - All 6 adapter calls ran.
    - A report was written.
    - `qualified_points` then refused it with "calibration report was made for a different fixture set".
  - Case 2: with `angry.svg` deleted, the run fails with a bare `FileNotFoundError`, again after all 6 calls.
  - The README added in this commit says old or altered fixture directories are refused "呼び出し前に" (before the call). That holds only for the cases being read.
  - Impact: this fails closed, and the checkpoints make a rerun free once the fixtures are regenerated. So it is not a Major.
- Fix: in `checked_fixtures` (or at the start of `evaluate`), check every file returned by `generated_files()`, not only `cases`. Raise the same "generate the fixtures again" error. Add a test that an altered unread fixture is refused with zero calls.

### n1 (nit): The gate trusts each reading's stored `metrics` instead of re-scoring the stored `prediction` against the current truth.
- Evidence (read):
  - `qualified_points` summarizes `reading["metrics"]` as written at calibration time.
  - The fixture bytes are now bound, but the scorer is not: `landmark_calibration.score` and the `error_px`/`occluded` semantics are not covered by any hash or by `POLICY_VERSION`.
  - A future change to `score` would leave older reports qualifying under the old scoring.
  - Nothing diverges today.
- Fix (optional): recompute `calibration.score(current_truth, reading["prediction"])` in the policy and compare it to the stored metrics, or bump a scorer version stored in the report.

Other checks (ran or read):
- I tried to break the new binding, and all of these were refused:
  - a reading for a fixture not in the generator (`ghost`)
  - a report with readings dropped (raster digest mismatch)
  - a later reading of a fixture with a different PNG or SVG hash (also covered by tests)
  - a report produced on stale fixtures with `checked_fixtures` bypassed
- A genuinely current end-to-end report (generate → stand-in render → `evaluate` → `qualified_points`) is accepted. The new checks are not over-strict for that path.
- All of these mutations are killed:
  - Round 3: byte-equality check, `truth_sha256` from the generator, `binding != raster`, `svg != truth.image_sha256`, the per-reading PNG and SVG checks, and the policy truth digest.
  - Round 2 spot-check: rms limit, `min_occluded`, zoom 2× size, configuration filter, `invalid_responses`, and the `fit.py` gate `if False`.
- `src/`, `goldens/`, `PROVENANCE.md` and `package.json` are unchanged. No images, readings or reports are committed. `OPENAI_API_KEY` is read only from the environment and never printed. The ADR 0002 status line is unchanged.
- CI is green: Node 22/24, golden, measure. The branch contains current `main`.
- PR #20 merges cleanly with this branch. PR #13 conflicts with it only in `src/`/`test/` files, which already conflict with `main`. This PR does not touch them, and `README.md` auto-merges.

## Verdict
converged: yes (Blocker 0 / Major 0 / Minor 1 / nit 1)
