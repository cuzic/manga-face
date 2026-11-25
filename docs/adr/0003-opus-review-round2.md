# PR #19 review (Opus, round 2)

Target: docs/adr-0003-part-curve-fitting @ b4bf42c67c3aab46b856bc32619e5de3d9796059

## Conclusion
The ADR 0003 text now resolves the round 1 Blocker and all six Majors: inputs are restricted to generate.py + R2-accepted references, measurement stays AI (Q8), the correspondence, distance, alignment and acceptance rules are fixed before the trial, and the trial is non-shipping. Two new Majors are in the ADR 0002 revision that ships in the same PR. (1) It adds a non-Batch, single-expression generation path that the merged R1 generate.py does not implement, and the PROVENANCE rows ai-0006/0007 already rely on it. (2) It removes owner decision points from D8/R8 and leaves it unclear whether the reference-distance metrics still fail a build. Not converged.

## Previous round
- B1: resolved. ADR 0003 D4 (line 43) allows only R1 generate.py + R2 accepted/domain references and excludes ai-0003–0005. The eligibility of ai-0006/0007 is still open (see M1).
- M1: resolved. The 対象 line (5) and the end of D4 (line 52) make curly long hair a non-shipping comparison, and any src/ or golden change needs an ADR 0001 change first plus U2/U3 and R9.
- M2: resolved. D1 (line 19) keeps the AI reader with independent runs (Q8), and D2.3 (line 27) fixes a deterministic one-to-one mapping with tie-breaks and penalties for unmatched strands. A small conflict with D1 remains (m2).
- M3: resolved. Lines 28–29 define ordered arc-length sampling, two-way coverage, separate handling of reference-side missing and model-side hidden spans, the weights, the 8-point minimum, and τ fixed before comparison.
- M4: resolved. D3 (line 37) fixes the neutral scale and estimates translation only, from preset-invariant anchors kept in a separate field. Eyes, mouth and brows are excluded, and the residual tolerance is fixed in advance.
- M5: resolved. Line 57 pre-fixes the acceptance rule (≥10% loss drop on an independent reference, no regression, owner approval). It requires a different-person reference, and line 45 marks the hand-tuned renderers and constant tables as non-shipping. The "no regression" test has no tolerance (m3).
- M6: resolved. 承認後の順序 (lines 69–72) lists R1/R2, R4, #10/R5/R6 and the model-side curve interface, and line 58 requires 8-expression validate for product candidates.
- m1: resolved. There is now a table at lines 47–50, private store or owner-only files, and nothing attached to a PR.
- m2 (round 1): resolved. The 10-reference rule is now per direction and per item, counting only non-missing values (line 45).
- m3 (round 1): resolved. Distances are normalised by the neutral similarity transform (lines 29 and 57).
- m4 (round 1): resolved. Line 58 requires 8-expression stage.svg and measure --check.
- Owner questions: answered in the text. Pre-existing ChatGPT references are excluded, AI annotation is kept, and curly long hair is non-shipping.

## Findings
### M1 (Major): ADR 0002 now names a one-image, non-Batch (and single-expression) trial generation path that the merged R1 generate.py does not implement or enforce, and ai-0006/0007 come from that path.
- Evidence: ADR 0002 line 77 says "試行は結果をすぐ確認できる通常の Image API で 1 枚ずつ行い…一括生成に Batch". Line 107 says "単一表情の試験では分割しない". main tools/fit/generate.py only submits `/v1/batches` jobs with the two fixed four-expression tuples (`EXPRESSIONS`, 2×2 prompt). PROVENANCE ai-0006/0007 say "accepted for the neutral-only trial", which a 2×2 prompt cannot produce. D1 (line 70) and AGENTS.md say generate.py enforces size, quality, the closed vocabulary and the cap. ADR 0003 D4 (line 43) requires "R1 の generate.py で生成", and its first candidate (bob) matches the ai-0006/0007 usage.
- Fix: Add an R1 follow-up (non-Batch single-image mode, single-expression template in D1, same constants and tests), or state that the trial path is outside D1. Then record each ai-0006/0007 generation path in PROVENANCE and say in ADR 0003 D4 whether they qualify.

### M2 (Major): The ADR 0002 D8/R8 revision silently drops owner decision points and leaves it unclear whether a gate exists.
- Evidence: On main, the D8 rule is "σ が顔の幅の 1.5% を超えるときは owner が決める", the R8 acceptance is "暫定の目標を超えると落ちる", and R8 has the owner checkpoint "閾値の再決定". In the PR, line 185 has the implementer fix the thresholds and the σ>1.5% handling. Line 248 says only "参考との距離は事前に固定した閾値で評価し、結果を報告する" and the owner column is "—". Line 185 also makes the reference distance an objective to minimise ("その条件を満たす案の中で参考画像との距離を小さくする"). Yet lines 177–179 still speak of 門 that references "fall" (門に落ちたら), and the table is still a gate table. 決定済み records only Q8, not this owner-authority change.
- Fix: Either restore "R8 fails above the pre-fixed thresholds" and the owner decision on σ>1.5%, or record the owner decision in 決定済み. In the second case, make D8 consistently say which metrics block shipping and which are report-only.

### m1 (Minor): The ADR 0002 status line omits R3, which is merged on main (#18, the PR's merge base).
- Evidence: ADR 0002 line 3 reads "一部実装済み(R0、R1 の生成ツール、R2 の参考の採否と来歴検査)". `git log origin/main` shows 804211f, R3 (#18).
- Fix: Add R3 (前処理とベクター化) to the status line.

### m2 (Minor): ADR 0003 D1 excludes "対応する房が不明な区間" from the loss, while D2.3 penalises unmatched reference strands. The reconciliation loop is also unbounded.
- Evidence: ADR 0003 line 19 says "対応する房が不明な区間には理由を記録し、画像からの損失に含めない". Line 27 says "対応なしの参考の可視房…罰則". Line 21 says "差が出た区間は…同じ指示で再計測する" with no retry limit.
- Fix: Limit the exclusion to spans whose strand identity is ambiguous inside a matched strand, never whole visible strands. Fix the re-measurement to one re-run, then mark the span missing.

### m3 (Minor): "悪化せず" in the trial acceptance rule has no pre-fixed tolerance.
- Evidence: ADR 0003 line 57 says "D5 の墨の距離と舞台サイズでの見分けやすさが悪化せず".
- Fix: Fix the tolerance before the comparison (for example, ink distance increase ≤ the calibrated noise, and the ADR 0001 D7 distinguishability check unchanged).

### m4 (Minor): The PROVENANCE rows ai-0003–0005 do not state that they are ineligible.
- Evidence: PROVENANCE.md lines 31–33 give the review value "owner review pending" (not a D2 value) and the use "manual measurements". ADR 0002 Q8 replaced manual measurement, D6.6 says unreviewed references are not fit inputs, and ADR 0003 D4 excludes these three.
- Fix: Add "not eligible as fit/eval input (ADR 0003 D4); historical prototype only" to those rows, or record an owner discard.

### m5 (Minor): Draft PR #16 rewrites the same ADR 0002 lines with diverging content.
- Evidence: Both PRs edit D4, the R4 row, Q8 and the D8 paragraph. #16 adds the face-width rule and concrete precision thresholds (detection 90%, RMS 2 px) and keeps the provisional D8 wording. This PR defers the thresholds to "本評価前に固定".
- Fix: Merge one PR first, then reconcile the other by merging main (no rebase), keeping the stricter of the two texts.

### n1 (nit): ADR 0002 D2 has two items numbered "5." (lines 101–102).
- Fix: Renumber.

## Verdict
converged: no (Blocker 0 / Major 2 / Minor 5 / nit 1)
