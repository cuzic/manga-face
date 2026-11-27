# PR #22 review (Opus, round 2)

Target: docs/adr-0004-line-art @ d1005cb2b85cb24f1e732e89e2d0351bdc46a7db

## Conclusion
The round-1 fixes are substantial: paper backing, brows over the fringe, the hair type table, the `recolor` revision, the stage-wide machine conditions and the conditional ADR 0001 status line all hold up. Two Majors remain. First, the M5 fix brings in a loop that the round-1 fix asked to forbid: Claude shows the owner overlays of the output on individual reference images, and the owner's verbal corrections go back to the implementer. That is per-reference tuning, which ADR 0001 D6 and ADR 0002 D6 do not allow. Second, L1 changes the shared eye ranges, invariants and presets. Those also drive the colored renderer, which the ADR keeps byte-stable until the switch, and the ADR does not say where those changes live or when `GENERATOR` goes up. converged: no.

## Previous round
- M1 resolved, with a small gap left (m1 below). D3 now has a parameter table, a drop list (`highlight`, `sideLen`), invariants, `RANGES`/`normalize` in L2 and the random switch with a `GENERATOR` bump. Checked against `src/params.ts` and `src/random.ts`.
- M2 resolved. D1 keeps brows above the fringe and adds a paper outline under the brows, and the alternatives section records the reason. This matches ADR 0001 D2/D3.
- M3 resolved. D1 says the face, ears, neck, body and hair are backed with opaque `#ffffff`, and D6 keeps the pixel check on both a white and a dark `bg.tint` background, which would catch a transparent face.
- M4 resolved (a wording issue remains in m2). The header and D7 revise ADR 0001 D4 `recolor` and the U7 condition, and D1 says `palette`, including `iris`, is accepted but not drawn.
- M5 partly resolved. The tool's location, owner, negative controls and similarity invariance are now defined, hair is covered, and the implementer is forbidden from opening the private repo and must say so in the PR. But reference overlays now feed tuning through the owner (M1 below), and resampling is not covered (m3).
- M6 resolved for purity (recursive), line goldens and the `measure --check` line section, with grids per stage. A new conflict with the colored path is introduced (M2).
- m1 resolved. D6 re-decides all three distinguishability floors and replaces the palette-extreme set.
- m2 resolved. Width is measured at 10 points between 20% and 80% of the centerline length.
- m3 resolved: there is one table, line-only deltas live in `src/line/` when needed, and the table goes back at the switch. This interacts with M2.
- m4 resolved. The ADR 0001 status line is now conditional ("それが承認されたら").
- m5 resolved in form: D5 states the PROVENANCE rows. The wording of the Referenced column is questioned in m4.

## Findings

### M1 (Major): D2 lets Claude show the owner overlays of the line art on individual reference images and pass the owner's corrections to the implementer, which is per-reference shape tuning that ADR 0001 D6 and ADR 0002 D6 forbid.
- Evidence: `docs/adr/0004-line-art-renderer.md:43` ("参考画像との重ね合わせは、Claude が非公開で作って owner に見せ、実装者には渡さない"). `:70` lets the L2 owner check change the hair default and range table. ADR 0001 D6.2 forbids "参考画像に合わせる調整" in v1. ADR 0002 D6 relaxes this only for aggregated parameter statistics from at least 10 independent references per direction (D6.2), and only where nothing reconstructs a single image (ADR 0003 D4). ADR 0004's own D3 (`:70`) repeats that 10-reference rule for defaults. An overlay-driven loop of "make the eye flick shorter" against one reference fits shipped geometry to that image. Routing it through words and the owner does not change the result, and the clean-room point comparison cannot detect it, because no points are copied. Round-1 M5 asked to forbid side-by-side tuning against prototype or reference renders at L1/L2. This text does the opposite.
- Fix: At L1, L2 and L4, show the owner only code-rendered output (originals, `stage.svg`, galleries) without references or prototype renders. State that reference overlays are used only under ADR 0002/0003 fitting with the 10-reference aggregate rule. Also say that table changes at L2 are judged on code output alone.

### M2 (Major): L1 changes the shared eye invariants, the `eyes.w`/`eyes.gap` ranges and possibly the presets, but the ADR also keeps the colored goldens, `measure --check` and `GENERATOR` 4 unchanged until the switch. It does not say whether those L1 changes go into the shared `RANGES`, `normalize`, `validate` and `PRESETS` (which forces a `GENERATOR` bump and changes colored output) or into a line-only copy in `src/line/`.
- Evidence:
  - `:75` re-measures the `eyes.w` and `eyes.gap` ranges in L1 and changes the eye invariants.
  - `:104` makes "`validate` が空" the L1 acceptance condition, but the public `validate` checks colored geometry.
  - `:79` allows `PRESETS` deltas to change in L1 and L3 as long as the colored golden passes.
  - `:94` keeps the colored goldens and `measure --check` until the switch.
  - `:72` keeps `src/line/` for the hair ranges only.
  - ADR 0001 D5 and U5 require a `GENERATOR` bump for any change to ranges, dependent constraints, `validate` or presets. `test/random.test.ts:8` pins `GENERATOR` at 4, and the random snapshots and the `eyes.w` clamp in `src/params.ts` feed the colored goldens.
  - The implementer therefore has to choose between breaking the "colored stays byte-stable" rule and inventing a parallel range/validate module, which is a design decision.
- Fix: Put line-art eye ranges, dependent constraints, invariants (a `validateLine` in `src/line/`) and preset deltas in `src/line/` until the switch. State that the switch PR moves them into `RANGES`, `normalize`, `validate` and `PRESETS` in one `GENERATOR` bump. Make the L1 condition name that line-art validate.

### m1 (Minor): The migration from the old hair type does not define the `sideLen` → `length` mapping, the `ears`/`length` dependency, or whether `validateRaw` reports old templates.
- Evidence: `:72` gives `sideLen` → `length`, `long` → `bob`, `wavy` → `short` with no formula. `sideLen` 16–40 maps to `length` 0–1 for `short` "耳の上〜耳の下" (`:65`), and nothing defines what `ears: 'peek'` does when `length` covers the ear. A user who asks for `long` silently gets `bob` (`:141`), and nothing says whether `validateRaw` (ADR 0001 D2 U1 order) flags it.
- Fix: Give the linear mapping and the `ears`/`length` constraint, and say whether old templates produce a `validateRaw` violation or only a README note.

### m2 (Minor): D7 misdescribes ADR 0076 `avatars` and does not say whether the line-art manifest declares `recolor`.
- Evidence: `:128` says `avatars` "は人物の選び直しで使う". In svg-diagram ADR 0076 D4/Q11, `avatars` acts on a material character only through its declared `recolor` colors, and emits `comic-avatar-ignored` otherwise. Declaring `recolor` with colors that are absent would silently ignore avatars. Leaving it undeclared gives the advisory.
- Fix: State that the line-art manifest does not declare `recolor`, so `avatars` yields `comic-avatar-ignored`, and phrase the revised U7 condition that way.

### m3 (Minor): The clean-room comparison is not invariant to resampling or to the centerline/outline representation.
- Evidence: `:48` compares "4 consecutive points" of output path points against the prototype's point lists. The prototype stores centerlines and emits offset outlines. A copied centerline that is re-splined and re-offset by a tapered-fill routine gives different path anchors, and the negative controls at `:47` (verbatim, scaled, rounded) do not cover this case.
- Fix: Compare curves after arc-length resampling, against both prototype centerlines and outlines. Add a "copied centerline, re-splined and re-offset" negative control.

### m4 (Minor): The PROVENANCE wording "Referenced: none (clean-room)" hides the provenance chain.
- Evidence: `:112`. The verbal spec in D2 was distilled by Claude from a prototype fitted to generated references, yet the `PROVENANCE.md` header says the listed parts were authored without reference matching.
- Fix: Write the Referenced column as "verbal geometry spec ADR 0004 D2/D3, distilled from a private reference-fitted prototype; no numbers or images passed (clean-room check YYYY-MM-DD)".

### m5 (Minor): The D6 pixel check does not name its fixture people, and its negative control may be vacuous.
- Evidence: `:120` says "人物 × 髪の型 × 全表情" without listing the people. The control "眉の紙の縁取りを外すと、前髪の上の眉で落ちる" fails only if some fixture actually has a brow crossing a lock line.
- Fix: List the fixture people, as ADR 0001 D7 does, including one where a brow is known to cross a fringe separator, and require the negative control to fail on that case.

## Verdict
converged: no (Blocker 0 / Major 2 / Minor 5 / nit 0)
