# PR #22 review (Opus, round 1)

Target: docs/adr-0004-line-art @ 38073dbf72996769aa7bad799168652a67779ca2

## Conclusion
The direction (line art, rebuild from verbal specs, parametric hair, staged switch) is sound and consistent with ADR 0002 D6 / ADR 0003 D4 in intent, but the ADR silently revises several ADR 0001 decisions it claims to leave untouched (the D2 hair type, brows-over-fringe, the `recolor` contract), leaves the paper backing of the line art undefined while dropping the only check that would catch it, and its clean-room verification is defeatable and only covers half of the risk. The L1-L3 stages also have no machine acceptance conditions and the new `src/line/` would escape the purity test. converged: no.

## Previous round
None.

## Findings

### M1 (Major): D3 adds new hair parameters, which changes the ADR 0001 D2 type that the header says is not changed, and leaves the type, ranges, defaults and random generation to the implementer.
- Evidence: docs/adr/0004-line-art-renderer.md:5 says "D2 のパラメータの型 ... は変えない"; :42-43 introduce bob/short degrees of freedom (bang count, cheek-lock count and curvature, curl-in strength, length tiers, side volume, ear visibility, crown height, clipper length, tip direction) that do not exist in `Base.hair` (`src/params.ts:12`, ADR 0001 D2 table). :45 says defaults/ranges "start from values decided in code" without naming fields, ranges, steps or dependent constraints. The fate of the existing `strands`, `ahoge`, `highlight`, `sideLen` is not stated. `src/random.ts:26` draws the hair group; the switch row (:69) bumps `GENERATOR` but does not list `randomCharacter`/`normalize`/dependent constraints in its scope, while :72 says U5 "resumes after the switch". ADR 0003 D4 also requires "ADR 0001 の型と工程への変更を先に合意し" before adding hair to `src/`.
- Fix: List D2 as revised and add a parameter table for the new `hair` fields (name, range, step, default per direction, invariants, `validate` codes), say what happens to `strands`/`ahoge`/`highlight`/`sideLen`, and put `randomCharacter`/`normalize`/dependent constraints into the L2 or switch scope with the first-draw >= 99% condition.

### M2 (Major): Line art lets the fringe cover the brows, reversing ADR 0001 D2's brows-over-fringe rule (the round-1 root cause of expression confusion) without listing it as a revision or re-gating it.
- Evidence: ADR 0001 D2 slot table (brows "前髪の上に、インクで描く(透け眉)") and D3 ("原因は眉が前髪の下に隠れていたこと"); current `src/fragment.ts:67-68` draws brows after the hair. ADR 0004 D1 (:24) draws hair in front of face lines with a paper fill that hides lines below, and D6 (:84) explicitly allows "前髪が眉にかかる". D4 (:56) and the distinguishability gate rely on brow angle for worry/angry/sad.
- Fix: Decide explicitly whether brows stay on top of the fringe (and state it in D1), or record this as a revision of ADR 0001 D2 with a check that brow visibility at stage size does not drop for any expression (e.g. visible brow fraction >= a fixed value over the hair grid).

### M3 (Major): Whether the face, neck and body are backed with paper is unspecified, while D6 removes the pixel contrast check on the premise that "lines sit on paper".
- Evidence: :22 removes skin/hair/top fills; only hair locks are said to be paper-filled (:24). Without an explicit paper silhouette the fragment is transparent where skin used to be, so the panel background (`bg.tint`, and dark mode per ADR 0001 D1/D4 and ADR 0074 D6) shows through and ink lines can become low-contrast or invisible; things behind the character also show through the face. D6 (:81) drops "コントラスト(ピクセル)" with the reason "塗りが無く、線は紙の上にある", which is only true if paper is drawn.
- Fix: Specify that the head/neck/body silhouette is filled with paper `#ffffff` (converted like the other hex colors) beneath all ink, and keep a cheap check (structural or pixel) that every ink feature is surrounded by paper, including a negative control without the paper fill.

### M4 (Major): Dropping fills breaks the ADR 0076 `recolor` / `avatars` contract that ADR 0001 D4 and U7 rely on, and this revision is not acknowledged.
- Evidence: ADR 0001 D4 ("ADR 0076 の `recolor` ... がそのまま効き") and U7 completion ("`recolor` を宣言した人物に `avatars` が効く"). ADR 0004 :22/:26 keep `palette` in the input type "to keep manifest compatibility", but `palette` is an input, not a manifest field; after the switch the manifest contains no skin/hair/top colors, so `recolor` is a no-op and `palette.iris` is ignored (single gray, :22). :5 lists only D4 style and part of D7 as revised.
- Fix: State in the header and Impact that ADR 0001 D4's `recolor` guarantee and U7's `avatars` condition are revised (or define what `recolor` maps to in line art), and say that `palette` (including `iris`) is accepted and validated but has no visual effect in v1.

### M5 (Major): The clean-room check is defeatable and covers only eyes/face, not the hair point lists that are the sharpest rights risk, and access to the prototype is not actually restricted.
- Evidence: D2 (:36) checks for "4 or more consecutive equal coordinates" between the private prototype and `src/`. The prototype draws parts in small local coordinates placed by a translate/scale transform (private record, described here only in general terms), so a copy rescaled into the ADR 0001 box coordinates, or rounded to 0.1, passes the check. The check is defined under D2 only; D3 (hair, :38-46) has no equivalent check, although :14 says the hair is the per-image point list forbidden by ADR 0002 D6 / ADR 0003 D4. The tool is "private" with no owner, location or definition, so no one but the reviewer can reproduce its result. "Not handed to the implementer" (:30) is not enforced: the implementer works with the same GitHub credentials and can read the private references repository; task specs and review notes are written by the agent that built the prototype, a second leak channel. Owner checks at L1/L2 could also iterate toward the remembered prototype, which is "参考画像に合わせる調整" (ADR 0001 D6.2).
- Fix: Make the comparison invariant to similarity transforms and rounding (normalize each sub-path by its bounding box before matching, with a stated tolerance), apply it to hair as well (per-lock root/tip/centerline vs. prototype locks), state where the tool lives and that its pass/fail plus the compared file list goes in the review record, forbid implementers from reading the private references repository and forbid numbers/prototype renders in task specs and review notes, and forbid side-by-side tuning against prototype or reference renders at L1/L2.

### M6 (Major): Stages L1-L3 have no machine acceptance conditions, and `src/line/` would not be covered by the purity/determinism test or by goldens until the switch.
- Evidence: D5 table (:64-70) gives only owner checks for L1/L2 and a measurement for L3. `test/purity.test.ts:8` reads only top-level `src/*.ts` (`readdirSync` without recursion), so `src/line/*.ts` (and already `src/hair/*.ts`) are not checked for `Math.cos`/`**`/`Date` etc. (ADR 0001 D5). Goldens and `measure --check` stay colored (:62), so line-art output has no byte-stability or invariant check through three stages. The new geometry (outer-corner flick, partial lower lid) also changes the eye width used by the ADR 0001 D2 dependent constraints (lash allowance, x1.08), which no stage re-derives. The D6 overlap check's "grid of all hair parameters" (:84) is undefined.
- Fix: Give each stage machine conditions: L1 = `validate` invariants re-derived for line-art eyes over the existing coarse grid, min-width check, determinism (two runs + golden-style snapshots of line-art gallery cells), purity test made recursive; L2 = self-intersection/root-order/overlap checks over a stated grid; L3 = distinguishability report; and state the dependent-constraint update.

### m1 (Minor): The distinguishability revision addresses only threshold 6, not the other ADR 0001 D7 conditions.
- Evidence: :82 re-decides "しきい値 6"; ADR 0001 D7 also has random-64 / palette-extreme minimum >= 3.5 and per-person >= 0.5 x median, and the palette-extreme axis collapses when there is no color.
- Fix: State which of the D7 conditions are re-measured and re-decided, and replace the palette-extreme set with a hair-parameter-extreme set.

### m2 (Minor): Min line width for tapered fills ("median width >= 2.8 excluding entry/exit") has no stated measurement method or extent of the excluded ends.
- Evidence: :80.
- Fix: Define it (e.g. width sampled at the centerline normals, excluding the first/last N% of arc length) or keep the raster check.

### m3 (Minor): Whether line-art expressions use the shared public `presets` table or a separate one is not stated; G6 drops the blush/squint that ADR 0001 D3 used to separate smile from neutral.
- Evidence: :53, `presets` is public (ADR 0001 D5). Changing it before the switch would change colored goldens.
- Fix: Say that `src/line/` has its own preset deltas until the switch, and that `presets` is replaced (with `GENERATOR` bump) in the switch PR.

### m4 (Minor): ADR 0001's status line already cancels U3 checkpoint 2 and pauses U4-U6 on the strength of an ADR that is still "提案".
- Evidence: diff of docs/adr/0001-manga-face.md:3; ADR 0004 :3; AGENTS.md (proposals are not implemented).
- Fix: Merge only after ADR 0004 is set to 承認, or word the ADR 0001 line conditionally.

### m5 (Minor): PROVENANCE handling for line-art parts is not stated.
- Evidence: AGENTS.md requires PROVENANCE rows for every part; parts written from a verbal spec distilled from a reference-fitted prototype need the "referenced" column to say so.
- Fix: Add one line in D2/D3 saying what the PROVENANCE rows record (verbal spec, no images, no prototype numbers).

## Verdict
converged: no (Blocker 0 / Major 6 / Minor 5 / nit 0)
