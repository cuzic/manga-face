# manga-face PR #9 — adversarial review, round 1 (head 9388efc)

## Verified (reproduced myself)
- typecheck / lint / test (27 pass) / golden: all green. CI 4/4 green.
- Byte identity vs origin/main (d50fcb7): a harness ran on both trees (scratchpad rv/base.ts). It covered
  `randomCharacterDetailed` for 2000 seeds (including firstDrawValid and repaired),
  every expression fragment and the manifest for 300 random characters,
  and 3000 fuzzed characters (raw/out-of-range/mirrored): validate messages, normalize output, toManifest output or error text.
  The SHA-256 over 13,700 outputs is identical on both trees.
- `pnpm measure` on both trees: `measurements.json`, `character-a.json`, `comic-sample.svg` are byte-identical, and the logs differ only in the output-dir line. The comic()/loadCharacter conformance in measure passes.
- Purity: no `node:*`, `Date`, `Math.random`, `cos/sin/pow/hypot`. Only `Math.sqrt` is used. TRIG and LIN are literal tables. No top-level side effects (only const/function/export), so `sideEffects:false` is truthful. No locale or Intl use.
- Fuzz (20k boundary/random/off-range/off-step parameter sets):
  - 0 crashes, normalize is idempotent.
  - Every `validate()==[]` face has its outline inside the head circle (recomputed independently), and `toManifest` never throws on a validate-clean face.
  - 20k random seeds: 0 invalid final characters, first-draw valid 99.985%.
  - NaN/Infinity/1e308 in numeric fields give violations (no crash, no silent pass).
- Leaks: nothing non-neutral in src/test/tools/README/PROVENANCE/ADR diff/PR body (no paths, names or tokens).

## Findings

### Major

**M1. The repair path is untested and the "re-validate, else throw" rule (ADR D5) is not implemented.**
- `src/random.ts` (randomCharacterDetailed, last `for` loop, ~L47): after the young-default fallback there is no final `validate`, so an invalid character can be returned silently.
  ADR D5: "そのあとにもう一度 validate し、まだ落ちるなら内部エラーを投げる".
- Issue #1 told Codex not to change random.ts content (U5 fixes it), so this is arguably a scope-deferred item. But the coordinator's checklist says "repair re-validates and never returns an invalid character", so it must be either added (3 lines: `const rest = validate(ch); if (rest.length) throw new Error(...)`) or explicitly recorded in the PR's Open questions as "deferred to U5".
  Today the PR says "Open questions: none".
- In my fuzz the fallback never fired (0/320k seeds), so no invalid output was observed. Still, it is unproven.
- Test gap: seeds 0..99 never take the repair path (`repaired` is empty for all 100). The mutations "repair loop off (`k <= 0`)" and "fallback loop deleted" both leave all 27 tests green.
  The only repair test (`repairGroups` with a message-stripped violation) tests the helper, not the loop.
- Fix: add a test that pins a seed that does repair. Seeds 3484, 6555, 8841, 15929, 70090 and 77049 are numeric seeds, all with `repaired: ['brows']` under GENERATOR 2. Assert `repaired` is non-empty, `validate(character)` is `[]`, and the JSON is pinned (add it to before-split.json or a sibling fixture).
  Add a test that `randomCharacter` over e.g. 2000 seeds is always valid.
  Add a unit test for the fallback by injecting a violation (e.g. export a pure `repair(ch, seed)` or test `repairGroups` + the group→DIRECTIONS fallback).

**M2. Many invariants and dependent constraints are not guarded by any test (mutation survivors).**
The checks below were each removed or broken in isolation; the whole suite stayed green (27/27), so the "540-point grid valid" test does not protect them:

| Mutation | Result |
| --- | --- |
| `normalize`: delete the `mouth.w` constraint line (params.ts ~L52) | survives |
| `normalize`: delete the jaw-lowering loop (head circle) | survives |
| `normalize`: delete the cheek-lowering loop | survives |
| `normalize`: `mouth.y` lower bound `RANGES['mouth.y'][0]` removed | survives |
| `selfIntersects`: `j = i + 2` → `i + 3` | survives |
| validate: remove `head-circle` (`> HEAD_R + 0.5` → `> 9999`) | survives |
| validate: remove `hair-self-intersect` | survives |
| validate: remove `mouth-reaches-chin` | survives |
| validate: remove `eyes-touch` | survives |
| validate: remove `brow-outside-head` | survives |
| validate: remove `mouth-anchor` | survives |
| validate: remove `mouth-near-eyes` | survives |
| validate: drop the `Number.isInteger` part of the strands check | survives (no test with strands 2.5) |
| validate: drop the palette early-return | survives |
| toManifest: `const ch = normalize(chIn)` → `chIn` | survives (no off-step input is ever turned into a manifest) |
| faceFragment: drop the `normalize` call | survives |
| baseline: `eyes.w`/`eyes.gap` constraint removal, no-clamp, no-snap, palette hex, range lower-only, anchor ±1, top +2, GENERATOR bump, toManifest-no-throw | caught |

Codex's 5 claimed mutations are real and I reproduced them (KEY_BELOW, mouth.y chin-20, nudge, selfIntersects false, groupOf).
AGENTS.md requires "新しいコードには…変異を最低 1 つ", and U1 says "不変条件を全表情で検査". Each `code` in D2's list has no test that produces it, except `strands`, `range`, `palette`, `face-self-intersect`, `eye-outside-face`, `brow-into-eye`.
- Fix: add table-driven tests with one crafted raw character per code, against `validateRaw`. Examples:
  - `head-circle`: `{cheek:96, jaw:0}` via validateRaw (circle test).
  - `hair-self-intersect`: needs a hair crafted to cross, or a mutation-targeted `hairParts` poly test.
  - `mouth-reaches-chin`: `mouth.y = chin` raw.
  - `mouth-near-eyes`: `mouth.y=eyes.y` raw.
  - `eyes-touch`: `gap = 0`.
  - `brow-outside-head`: `brows.dy = -60` raw.
  - `mouth-anchor`: some raw/`mirror` case, plus the 'think' case I found: `mouth{w:25,y:58}, eyes{w:23,h:17,tilt:-2,gap:46,y:25}, head{cheek:90,chin:97,jaw:0.05,chinW:0}`.
  - `mouth-outside-face`: `mouth.w=48`, `cheek=74` raw.
  - strands 2.5 (and NaN).
  - Add a test that `toManifest` of an off-step but in-range character equals the manifest of its `normalize`d copy.
  - Add a test that `normalize` output satisfies the head-circle, `mouth.w` and `mouth.y` bounds on a grid with the extremes (cheek 96, chin 98, jaw 1, chinW 0/16, mouth.w 48, mouth.y 70) — the current grid goes only up to 96/98 with the characters' fixed jaw/chinW/mouth values.

### Minor

**m1. Tree-shaking/purity test is too narrow** (test/purity.test.ts L14-16). It does not catch `Date(` / `Date.UTC`, `Intl`, `toLocale*`, `toFixed`, `performance`, `globalThis`, or `Math.atan/exp/log` variants beyond those listed (the last are covered). Add `/\b(Date|Intl|performance|globalThis)\b|toLocale|toFixed/`. It also does not check "no top-level side effects" (the claim `sideEffects:false`). A cheap check is to bundle `src/index.ts` with the already-present esbuild with `--tree-shaking=true` and assert that importing only `INK` pulls no calls, or to assert that every top-level statement in src is an import/export/const/function/type.

**m2. `validate` range check has no float tolerance** (src/validate.ts ~L22: `v >= lo && v <= hi`). `eyes.iris = 24*0.05` (= 1.2000000000000002, a step-aligned value) is reported as a range violation (`outside 0.6..1.2`), while `normalize` would clamp it harmlessly. Behaviour is identical to main, so it is not a regression. Fix by comparing with `clamp`-style rounding (`Math.round(v*1e6)/1e6`) or noting it in D2.

**m3. `validate`/`defaultCharacter` hand back a non-valid thing for non-number input.**
- `defaultCharacter({hair:{strands: NaN}})` returns a NaN character although its doc says "A valid character" (src/styles.ts `defaultCharacter`: it calls `normalize` only; `clamp(NaN)` gives NaN).
- The string `'86'` for `head.cheek` passes `validate` (JS coercion), and `toManifest` succeeds.
- Types forbid it, so this is Minor. Fix: in `clamp`, map non-finite to the range default/min; in `validate`, add `typeof v !== 'number'` to the range check.

**m4. `brow-into-eye` is always `group:'brows'`**, but D2 says a violation whose cause is another group (eyes.h) should be given to the cause or return several groups. In my sweep (360 extreme eye shapes × young brows) the young brows fallback was always valid, so the repair always terminates. Still, if the first repair of brows keeps failing because of a tall eye, the loop redraws only brows. This is consistent with the original behaviour (the `/brow/` regex also mapped to brows), so I would not block. Optionally emit `{group:'eyes'}` as well in the `brow-into-eye` case so that U5 can repair the true cause.

### Nit

- n1. `src/face.ts` is now a pure re-export barrel and `src/index.ts` is `export * from './face.ts'` plus `prefixIds`. The AGENTS.md "リポジトリの地図" and ADR 0001 L53 still describe `face.ts` as the module that "U1 が分割して固める". A short note or folding the barrel into `index.ts` would avoid confusion. The PR table's last row says "`src/face.ts` → `src/index.ts` から公開", which matches the current state.
- n2. `validateRaw` is exported from `src/validate.ts` but not from `src/index.ts` (and neither are `repairGroups`, `hairParts`, `faceSegs`). The exports map only has `"."`, so tests reach into `src/*.ts` directly. This is fine for U1 but make the decision explicit (it is a test-only API).
- n3. The PR text says "格子 540 点の違反は 0 件", which is true; the Issue's second acceptance item (grid with the `直接 faceFragment に eyes.gap:48, cheek:74` raw case) is implemented through `validateRaw`, which is reasonable (the test uses `validateRaw`, not `faceFragment`, as the Issue says).
- n4. `before-split.json` was committed together with the split test as the first commit (`9ef3307`), which is what the Issue asked for. The PR body says the fixture was verified on that pre-split commit, and I reproduced the identity from the other side.

## Conformance matrix (Issue #1 / ADR U1)
- Split into modules with public names unchanged: OK (`index.ts` public names identical; tools import via `index.ts`).
- `validate` structured `{group, code, expression?, message}`, codes from D2: OK (all 14 codes emitted).
- Order (raw ranges/strands/palette, then geometry after normalize) and the one-line ADR note: OK, and the original out-of-range reporting is preserved (verified on 3000 fuzz inputs, identical messages to main).
- `toManifest` message format identical: OK.
- `groupOf` replaced by `violation.group`: OK.
- Ranges and invariants for every parameter: OK in code, partially tested (see M2).
- 540-point grid valid: OK. Mutation table: reproduced.
- Generator version rule: no bump needed since all 2000 seeds are byte-identical (GENERATOR stays 2). OK.
- Repair re-validation: NOT implemented/not tested (M1).
- `tools/measure.ts` minimal fix with the output unchanged: OK (verified byte-for-byte).
- Public API/exports map: consistent (`"."` → `src/index.ts`, types and default). svg-diagram stays a devDependency with `import type` only (src/manifest.ts). `comic()` conformance passes in `pnpm measure`.
- Leaks: none.

## Verdict
No Blocker. 2 Majors (M1 repair path: untested and the D5 final re-validate/throw missing or not recorded as deferred; M2 most invariant codes and the dependent constraints are unguarded by tests, 15 hand mutations survive). The refactor itself is sound and byte-identical.
Round 1: **changes requested** (converged once M1 and M2 are fixed; the Minors are optional).

Worktrees `manga-face-review-9` and `-9main` were removed. Nothing was pushed.
