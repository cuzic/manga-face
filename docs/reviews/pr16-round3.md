# PR #16 review (Opus, round 3)

Target: feat/r4-ai-landmarks @ ee2d63e7aee752474a919da6775825f8474a8eb0

## Conclusion

All round-2 findings are fixed. I re-applied every round-2 mutation and each one now fails the suite. The PR is rescoped as "R4 tooling", and the ADR 0002 status line is unchanged. CI is green: Node 22/24, golden, measure. It has not converged, because the m3 fix (binding the calibration report to the fixture set) can be bypassed. `fixture_set.truth_sha256` is a digest of what `generate()` produces in the current code. It does not describe the fixtures that were actually read. `raster_sha256` is computed from the report's own readings. So a calibration run against a stale or altered fixture directory gets a report that `qualified_points` accepts. That is the exact "old fixtures as eligibility evidence" case the Opus follow-up excluded.

## Previous round

- M1 (policy gate untested): **resolved**. Ran each mutation: rms, detection, min_visible, min_occluded, invalid_responses, configuration filter, size filter, zoom 2× size, zoom ID distinctness, truth digest, and `fit.py` `if False`. All killed.
- M2 (response/binding rejections untested): **resolved**. Mutations killed: model check, blank reason, duplicate `inference_id` in `run`, `record_sha256` check, zoom `// 2`, dict check.
- M3 (D8 σ untested): **resolved**. Mutations killed: `/4`→`/2`, floor removed, 3→2 sheets, mixed configuration, duplicate reference, zoom pass, reused inference ID, `one_sided` = 0, mean face width, field binding.
- m1 (`--record`): **resolved**. Read `landmark_inference.py` and the README; tests `test_record_path_is_explicit…` and `test_cli_accepts_record` exist.
- m2 (scope): **resolved**. Title and body say "R4 tooling", calibration, repeatability and Schema are deferred, and the ADR 0002 status line is not in the diff. The PR is not a draft, which is consistent with the rescope.
- m3 (report not bound to the fixture set): **not resolved in substance**. See M1.
- m4 (non-dict `points`/`missing`): **resolved**. The mutation is killed.
- n1 (wording/README): **resolved**. "prompt SHA" is gone, and the README documents `landmark_repeatability.py`.

## Findings

### M1 (Major): The calibration report's `fixture_set` does not identify the fixtures that were read, so a report scored on stale or altered fixtures passes the fit gate.
- Evidence (read and ran):
  - `run_landmark_calibration.evaluate` writes `truth_sha256 = calibration.fixture_truth_digest()`. That function regenerates the fixtures from the current code into a temporary directory (`landmark_calibration.py:110-120`) and never looks at `--fixtures`.
  - `checked_fixtures` checks only that each SVG matches its own `.truth.json` and `.raster.json` (`run_landmark_calibration.py:28-49`). It does not check that they equal what `generate()` produces now.
  - In `landmark_policy.qualified_points:16-22`, `raster_sha256` is compared to a digest rebuilt from the same report's `readings[].png_sha256`, which is a self-consistency check only. It uses `setdefault`, so only the first reading of each fixture is covered.
  - Repro (scratch script, not committed): I generated the fixtures, then rewrote the three base SVGs and truths as a consistent "older revision" (SVG changed, chin truth moved 30 px, PNG and `.raster.json` matching). I ran `evaluate` with a stubbed adapter.
    - The report's `truth_sha256` equals the current-code digest.
    - `qualified_points` accepts the report without error.
  - A real stale `out/landmark-fixtures` (for example, the first API run on the earlier fixtures, which the PR body says must not be used) would be accepted the same way. Its saved checkpoints would even be replayed at no cost.
  - Also untested: removing `if binding != raster` or `if raster["svg_sha256"] != truth["image_sha256"]` in `checked_fixtures` leaves the suite green (ran).
- Fix: In `checked_fixtures`, require each fixture's SVG and truth bytes to equal what `generate()` produces now, and compute `truth_sha256` from the files actually read. In the policy, also check every reading's `svg_sha256`/`png_sha256` against the per-fixture map, not just the first. Add a test with a stale fixture directory, plus tests for the two `checked_fixtures` binding rejections.

### m1 (Minor): The production OpenAI adapter's own contract checks are untested.
- Evidence (ran). In `openai_landmark_adapter.py` these mutations survive:
  - removing `response.get("model") != model` (the only check that the served snapshot equals the configured one; `check_response` sees only the adapter's echo of the configured name)
  - loosening the null/reason consistency to `x is None or y is None`
  - including the image in the `sent_configuration_sha256` payload

  The last one would make calibration and inference hashes never match. That fails closed, but nothing pins the invariant that calibration, pass 1/2 and zoom share one configuration hash.
- Fix: Add `parse_reading` tests for a different `model`, a half-null mark and a null mark without a reason, and a test that two tasks differing only in image and size give the same `sent_configuration_sha256`.

### m2 (Minor): Two more checks have no test, though both currently fail closed.
- Evidence (ran). These mutations survive:
  - In calibration, the duplicate-inference-ID rejection (`run_landmark_calibration.py:82`, `if response_id in seen`). Without it, a replayed reply counts as a second independent calibration reading toward `min_visible`.
  - The zoom crop in `landmark_inference.run` (`zoom = image.resize(...)` of the whole sheet instead of the cell). The policy then drops the points on the zoom distance.
- Fix: Add a calibration test where the adapter returns the same ID twice, and an inference test asserting that the zoom request's image is the 2× resample of the cell crop.

### n1 (nit): The PR body says `tools/fit/landmarks.ts` fails "because `faceHalfWidth` is not exported from `src/index.ts`". ADR 0002 D7/R5 says the fix is to import from `src/geometry.ts`, not to grow the public `index.ts`.
- Evidence (read):
  - `landmarks.ts` is the unchanged spike from main, with an `@ts-nocheck` header.
  - ADR 0002 lines 37/168/245/303 document that it does not run until Issue #10 lands, and assign the repair to R5.
  - This is pre-existing and not a defect of this PR. Stubbing `fit.model` in `AiFitTest` is therefore justified, and the gate under test (`qualified_points` and the point filter) is not stubbed.
- Fix: Reword the body to point at ADR 0002 R5 / Issue #10 rather than an `index.ts` export.

Other checks:
- No change to `src/`, `goldens/`, `PROVENANCE.md` or `package.json`.
- No images or readings are committed.
- `OPENAI_API_KEY` is read only from the environment and never printed.
- PR #20 merges cleanly with this branch. PR #13 conflicts with main only in `src/`/`test/` files, which this PR does not touch.

## Verdict
converged: no (Blocker 0 / Major 1 / Minor 2 / nit 1)
