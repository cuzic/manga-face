# PR #16 review (Opus, round 2)

Target: feat/r4-ai-landmarks @ 5a78e1e883e88ba8782422ddc35f1cb835b936f1

## Conclusion

The merge of main (5a78e1e) is clean: relative to `e717f40`, the only change to ADR 0002 is the D4 repeatability/accuracy text from this PR, D8 and R5 are main's text unchanged, and nothing from main is dropped. `git diff origin/main HEAD` touches only this PR's files. The tools fail closed on everything I tried, and CI is green (Node 22/24 + Python unittest, golden, measure). It has not converged, though. Hand mutations show that the R4 eligibility gate (`landmark_policy.qualified_points` and the AI branch of `fit.py`), most of the response and binding rejections from round 1, and the D8 sigma computation (`landmark_repeatability.measure`) are essentially untested. Every mutation in those paths survives.

## Previous round

- R4 completion (real-model calibration on the current fixtures, 5-sheet repeatability): **not resolved**. The PR body says both are still not run. The tooling exists. See m2.
- Image/provenance binding, full reviewed grid, SVG/PNG binding before any call: **resolved in code** (`checked_cells`, the hash check in `run`, the raster binding in `checked_fixtures`). Grid rejections are tested (duplicate/missing/domain). The record-hash rejection is not: that mutation survives (M2).
- Reject duplicate inference ID, model mismatch, out-of-range point, missing reason: **resolved in code**, but only the out-of-range/missing-point rejection is tested. The model, reason and duplicate-ID mutations all survive (M2).
- Concurrent writers to one report, usage accounting for unanswered calls: **resolved**. `calibration_lock` and `summarize_usage` work and are tested. Saved-but-failed attempts are not resent (`read_or_attempt` test).
- No private references or measurement results committed: **resolved**. The diff contains only code, docs and review files.
- Opus follow-up "old-fixture calibration must not be used as eligibility evidence": **holds only by accident**. The old readings carry no `sent_configuration_sha256`, so the policy filters them out. Nothing binds a report to the current fixture set (m3).

## Findings

### M1 (Major): The gate that decides which AI landmarks enter the fit is essentially untested. Removing any of its thresholds or binding checks leaves the suite green.
- Evidence (ran: `python -m unittest discover -s tools/fit`, 28 tests, one mutation at a time, each confirmed applied, then reverted). In `tools/fit/landmark_policy.py` these all survive:
  - dropping `rms_px <= max_rms_px`
  - dropping `detection_rate >= min_detection`
  - dropping `visible_readings >= min_visible`
  - dropping the `occluded_readings >= min_occluded` requirement for cheeks/ears/outer eye corners/brows
  - disabling `invalid_responses != 0`
  - removing the `sent_configuration_sha256` filter on calibration readings
  - removing the zoom `source_size == 2 × size` check
  - removing the zoom inference-ID distinctness check

  In `tools/fit/fit.py`, replacing `if calibration is None or zoom is None:` with `if False:` (an AI fit without calibration) also survives. The only policy test (`test_calibration_and_zoom_filter_out_unsafe_points`) exercises just the occlusion false-positive and the zoom-distance branches. No test calls `fit.main` on an `ai-generated` record. These are the ADR 0002 D4 provisional criteria ("可視校正 2 回以上, 検出率 90%, RMS 2 px, 遮蔽 2 回以上 …").
- Fix: Add table-driven tests for `qualified_points`, one failing case per limit and per binding check, plus an AI-record `fit.main` test that refuses a fit without `--calibration`/`--zoom` and records `excluded_by_policy`.

### M2 (Major): The round-1 response and binding rejections are implemented but not tested, and the zoom-to-source coordinate mapping is not tested either.
- Evidence (ran). These mutations in `tools/fit/landmark_inference.py` all survive:
  - `check_response`: drop the model-version check
  - `check_response`: drop the "every missing mark needs a reason" check
  - `run`: drop the duplicate-`inference_id` check
  - `run`: neutralise the image/record SHA-256 vs. prepared-manifest check (`... and False`)
  - `run`: remove the `// 2` that maps zoom coordinates back to the source cell

  The `// 2` mutation would make every zoom comparison wrong by a factor of 2. Today that fails safe, because all points get excluded, but nothing detects it.
- Fix: Add focused tests: adapter responses with the wrong model, a blank reason, and a reused ID; a manifest with a changed `record_sha256`; and a zoom reply whose doubled coordinates must map back to the pass-1 point.

### M3 (Major): The D8 sigma computation for the R4 acceptance ("5 枚について点別の σ") is never run by any test.
- Evidence (read). `tools/fit/landmark_repeatability.py:measure` is not referenced from any test. Only `face_width` is tested (`test_face_width_uses_the_two_measured_cheek_spans`). The following can all change without a failure:
  - the D8 formula (`/4`, the 2 px floor normalised by face width, the `×100`)
  - the 5-sheet / distinct-reference / single-configuration checks
  - the `insufficient` (< 3 paired sheets) rule
  - the counting of one-sided detections

  This number becomes the denominator of every D8 gate.
- Fix: Add a test with five synthetic prepared manifests and paired readings that checks a known sigma, including one sheet with a missing cheek and one with the floor active, and checks rejection of a duplicate reference, a mixed configuration, and a zoom pass.

### m1 (Minor): `landmark_inference.py` hard-wires the provenance file to `<sheet>.provenance.json`, while R2/R3 use an explicit reviewed-record path. The documented pipeline therefore refuses to run unless the reviewed record is copied to that name.
- Evidence (read):
  - `landmark_inference.py:run` reads `image_path.with_suffix(".provenance.json")`.
  - `review_reference.py review <sheet.png> <draft.json> <reviewed.json>` writes to a new path and cannot overwrite the draft, because `hardlink_to` fails if the path exists.
  - `vectorize.py --sheet-record <reviewed.json>` stores that file's hash as `record_sha256`.
  - Following the README therefore ends in "input image or provenance differs from the prepared manifest". `fit.py` has `--record`; the inference runner has no equivalent, and the README does not mention the naming convention.
- Fix: Add `--record <reviewed.json>`, defaulting to the sibling file, like `fit.py`, and document it.

### m2 (Minor): The R4 acceptance in the ADR 0002 implementation plan is not met, yet the PR is open as ready for review even though its body says it "stays draft".
- Evidence (ran `gh pr view 16 --json isDraft`: `false`). The PR body says the calibration on the current fixtures and the 5-sheet repeatability were not run. The R4 row also lists "出力 JSON が Schema に合う", but the readings are validated only in code; there is no schema. The ADR status line correctly does not claim R4.
- Fix: Either return the PR to draft, or rescope it explicitly as "R4 tooling" and leave the R4 status/acceptance (reports, schema or an amended criterion) to a follow-up. Do not flip the R4 status on merge.

### m3 (Minor): A calibration report is not bound to the fixture set that `landmark_calibration.generate` produces today.
- Evidence (read). `qualified_points` checks the model, the configuration hash, the size and `invalid_responses`. It does not check the readings' `svg_sha256`/`png_sha256` against the current fixtures, the case coverage, or two passes per case. A report from a future revision of the fixtures (for example, corrected truth), or a hand-assembled report, would be accepted as eligibility evidence.
- Fix: Record a fixture-set digest (truth plus raster hashes) in the report, and require it in the policy, which should be included in `POLICY_VERSION`.

### m4 (Minor): A custom adapter that returns `points`/`missing` as non-objects crashes the runners with an uncaught `AttributeError`.
- Evidence (read). In `check_response`, `.keys()` on a list raises `AttributeError`.
  - In `run_landmark_calibration.evaluate`, only `KeyError`/`TypeError`/`ValueError` are caught, so the whole run aborts without writing a report, after the checkpoint was already saved.
  - The inference CLI prints a traceback.

  The OpenAI adapter itself always emits dicts.
- Fix: Type-check `points`/`missing` as dicts in `check_response` and raise `ValueError`.

### n1 (nit): `landmark_repeatability.py` describes `sent_configuration_sha256` as a "prompt SHA-256" (docstring and error text), and the README does not mention the repeatability tool.

## Verdict
converged: no (Blocker 0 / Major 3 / Minor 4 / nit 1)
