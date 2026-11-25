# PR #22 review (Opus, round 4)

Target: docs/adr-0004-line-art @ f48c3b20f7897de1524ecdc1676f3720808290ed

## Conclusion
All five round-3 findings are resolved by the fix commit f48c3b2. The ADR now picks option (a) for the 6 extra expressions: they are redrawn in L3 with the same machine conditions, an owner look and the clean-room check, so the switch drops no public feature. The changed text agrees with ADR 0001 (D2 clamping, D3 mechanism, D7 distinguishability over 8 expressions and 28 pairs, U4 and Q8), ADR 0002 and ADR 0003, and with the rest of ADR 0004. converged: yes.

## Previous round
- M1 resolved. `:89` adds a row for the 6 extras (`><`, dot and half-closed eyes keep the ADR 0001 D3 meaning, still usable through `expressionMap` after the switch). `:107` (L3) draws `shy` `smug` `deadpan` `clench` `cry` `blank`, runs the common conditions over 14 expressions, measures distinguishability over the 8 (as ADR 0001 D7 does), and adds the extras' look to the owner check. `:111` says the switch does not drop a public feature, and limits the deferred U4 work to reviewing the extras and preparing the script-naming extension (ADR 0001 `:217`, Q8). The switch condition "ADR 0001 D7 の全基準" can now be met for all 14 expressions.
- m1 resolved. `:121` defines the L1 fixture set as the 3 placeholder-head people (`CHARACTERS` a, b, m, which exist in `src/styles.ts`). It measures the non-brow feature lines and the brow paper outline only, and starts the brow × lock crossing floor at L2.
- m2 resolved. `:49` and `:112` run the clean-room check at L1 to L4 and at the switch, so L3 is included.
- m3 resolved. `:144` says out-of-range eye values in existing JSON are clamped by `normalize` (the ADR 0001 D2 rule), and that the switch PR and README list the changed ranges. Values inside the range cannot be newly rejected, because L1 must re-measure the ranges so the invariants hold at their ends (`:75`).
- n1 resolved. `:5` now says one preset table after the switch, with line-only deltas in `src/line/` until then (D4).

## Findings
None.

## Verdict
converged: yes (Blocker 0 / Major 0 / Minor 0 / nit 0)
