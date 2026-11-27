# PR #22 review (Opus, round 3)

Target: docs/adr-0004-line-art @ 7cc94f5e79149482227dd9fae8e96fa5683e2497

## Conclusion
All seven round-2 findings are resolved. The owner now looks only at code-rendered line art, the line-only overrides and `lineValidate` live in `src/line/` until one `GENERATOR` bump at the switch, and the migration, `avatars`, clean-room resampling, PROVENANCE wording and pixel fixtures are all specified. One Major remains, and it is not new: the ADR never says what happens to the 6 extra expressions (`shy` `smug` `deadpan` `clench` `cry` `blank`). They are public today through `expressionMap`. No stage draws them in line art. Yet the switch must pass "ADR 0001 D7 の全基準", which pixel-checks all 14 expressions. converged: no. CI is green on this head (test node 22/24, golden, measure).

## Previous round
- M1 resolved. `:43` limits the owner check to line-art output at full size and stage size, with no references or prototype beside or over it. Corrections go to the implementer in words. Fitting a shape to one reference is forbidden, and reference influence must go through the 10-per-direction aggregate. `:70` limits L2 table changes to that output-only owner judgment.
- M2 resolved. `:79` keeps the public `PRESETS` `RANGES` `normalize` `validate` and `GENERATOR` 4 unchanged until the switch. Line-only overrides and `lineValidate` live in `src/line/`, L1–L3 conditions name `lineValidate`, and the switch folds the overrides in with one `GENERATOR` bump. `:72` and `:104` agree with this.
- m1 resolved. `:72` gives `length = round((sideLen − 16) / 24, 0.1)`, `long` → `bob` (length 1), `wavy` → `short`, and drops `highlight`. Values that can be migrated are not reported. `ears` is independent of `length`. This works because `validate` runs `validateRaw` on the normalized character (`src/validate.ts:48`).
- m2 resolved. `:128` says no `recolor` is declared and `avatars` yields `comic-avatar-ignored`. `:129` rewrites the U7 condition to match.
- m3 resolved. `:48` resamples by arc length, recovers centerlines from tapered fills, matches with Fréchet distance after a similarity fit, and adds the "re-splined and re-offset centerline" negative control.
- m4 resolved. `:112` records the provenance chain and the clean-room check date.
- m5 resolved. `:120` names the 4 fixture people and requires at least 8 brow × lock crossings, so the negative control cannot pass vacuously.

## Findings

### M1 (Major): The ADR does not say what the switch does with the 6 public extra expressions. No stage draws them in line art, but the switch condition requires ADR 0001 D7 criteria that cover them, so the implementer must decide whether to draw them without an owner check or remove them.
- Evidence:
  - `src/presets.ts:21-31` and `src/manifest.ts:12-17`: `shy` `smug` `deadpan` `clench` `cry` `blank` are already reachable through `toManifest(..., expressionMap)`, and README line 7 advertises "6 extras".
  - ADR 0001 D7 (`docs/adr/0001-manga-face.md:70`) runs the feature-line pixel check over 14 expressions, and `tools/measure.ts:82-90` measures the extras.
  - ADR 0004 `:107`: the switch replaces `faceFragment`, deletes the colored renderer, and requires "ADR 0001 D7 の全基準(D6 の改訂後)".
  - ADR 0004 `:120` itself names the `><` and dot eyes, which belong only to `clench` and `blank`.
  - Yet `:104-106` draws only the 8 ADR 0074 expressions. `:90` says only "追加の表情の `expressionMap` は変えない", and `:110` defers U4 (the extras) until after the switch.
  - So at the switch, `faceFragment(ch, 'shy')` has no line-art definition. The implementer must either invent 6 line-art expressions with no stage, no owner check and no blind check, or drop a public feature that the ADR says it keeps.
- Fix: Pick one and write it down. (a) Add the 6 extras to L3, with the same machine conditions, owner check and pixel and distinguishability checks, before the switch. Or (b) have the switch remove the extras from `PRESETS`/`EXTRA_OF`, so `expressionMap` rejects them with an actionable error until U4. List this as a breaking change in 影響 and README, and limit D6 and the switch criteria to the 8 expressions.

### m1 (Minor): The pixel check's fixture people start "L2 から", but the common conditions put the D6 feature-line check into `measure --check` from L1, so L1 has no defined fixture set.
- Evidence: `:100` (every stage, added in the first L1 PR) and `:120` ("対象の人物は、L2 から"). L1 has only the placeholder head outline (`:104`), so the ≥ 8 brow × lock crossing floor cannot be met there.
- Fix: State the L1 fixture set (for example, the 3 hand-made people without hair). Say that the crossing-count floor and the brow-paper negative control start at L2.

### m2 (Minor): The clean-room comparison skips the L3 review, which is the stage that draws new eye, brow and mouth shapes for `worry` `angry` `think` `sad`, the part families where the prototype had 6 variants each.
- Evidence: `:49` and `:111` run it at L1, L2, L4 and the switch only. Background `:11` lists 6 prototype variants each of eyes, brows and mouths.
- Fix: Run the check at the L3 review too, or say why the switch-time run is enough for L3.

### m3 (Minor): 影響 lists only the hair type as an input-compatibility break. The switch also folds the narrowed `eyes.w`/`eyes.gap` ranges and the new eye invariants into the public `RANGES`/`normalize`/`validate`, so existing character JSON near the old extremes will be silently clamped or newly rejected.
- Evidence: `:75`, `:79`, `:141`. In `src/params.ts:20` and `:59-60`, `normalize` clamps `eyes.w` and `eyes.gap`.
- Fix: In 影響 and the switch PR's README change, say that old eye values outside the re-measured ranges are clamped (or reported), and name the old and new ranges.

### n1 (nit): The header says "プリセットの表は 1 つのまま", but D4 keeps line-only preset deltas in `src/line/` until the switch.
- Evidence: `:5` vs `:79`.
- Fix: Add "(切り替えのあと)".

## Verdict
converged: no (Blocker 0 / Major 1 / Minor 3 / nit 1)
