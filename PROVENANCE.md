# Provenance of the art

Every part of the art in this repository is original geometry **written as code** (ADR 0001 D6). No generative-model output, no tracing of existing art, no
matching to reference images. Open Peeps and DiceBear are structural references only (the slot layout and the named colour slots); none of their paths is used.

A part is a face outline, an eye kind, a brow, a mouth kind, a nose, a hair template, or a preset. **A PR that adds or changes a part must add or change its row;
`test/provenance.test.ts` fails when a part has no row.**

| Part | Written by | Date | Method | Referenced | Resemblance check |
| --- | --- | --- | --- | --- | --- |
| face outline (`src/geometry.ts` · `faceSegs`: temple, cheekbone, jaw corner, chin) | coding assistant (Claude) for the owner | 2026-11-22 | geometry written as code from a geometric description (cubic segments from `cheek`, `chin`, `jaw`, `chinW`) | none | owner checkpoint (U0.5) |
| eyes (`src/eyes.ts` · `eyeSvg`: open, arc, arcDown, cross, dot, half) | coding assistant (Claude) for the owner | 2026-11-22 | geometry written as code (upper and lower lid curves from `w`, `h`, `tilt`; iris clipped to the lid) | none | owner checkpoint (U2) |
| brows (`src/brows.ts` · `browSvg`) | coding assistants (Claude and Codex) for the owner | 2026-11-23 | geometry written as code (a tapered filled shape from angle and thickness) | none | original paths and deltas reviewed in U2; owner checkpoint pending |
| mouths (`src/mouths.ts` · `mouthSvg`: flat, smile, open, o, frown, wave, omega, grit, tri) | coding assistant (Claude) for the owner | 2026-11-22 | geometry written as code (paths from width and depth) | none | owner checkpoint (U2) |
| nose (`src/mouths.ts` · `noseSvg`: dot, line) | coding assistant (Claude) for the owner | 2026-11-22 | geometry written as code | none | owner checkpoint (U2) |
| hair templates (`short`, `bob`) and fringe locks (`src/hair.ts` · `hairParts`) | coding assistant (Claude) for the owner | 2026-11-22 | geometry written as code (a silhouette; locks computed from strand count and parting) | none | owner checkpoint (U3) |
| presets (`src/presets.ts` · `PRESETS`: the 8 ADR 0074 expressions and 6 extras) | coding assistants (Claude and Codex) for the owner | 2026-11-23 | numbers written as code: deltas on the character's base eyes, brows and mouth | none | original paths and deltas reviewed in U2; owner checkpoint pending |
| body, neck, ears (`src/fragment.ts` · `faceFragment`) | coding assistant (Claude) for the owner | 2026-11-22 | geometry written as code | none | owner checkpoint (U2) |

"Method" is one of: *by a person as code*, *by a coding assistant as code*. ADR 0002 D6 also allows code-authored geometry and presets to use rounded aggregate parameter statistics from reviewed references. Shipped art excludes generated drawings, traced curves, and fitted values copied from individual references.

## References (ADR 0002; not shipped as art)

References are used for fitting and evaluation only. The shipped art is always our code redrawing from parameters. **Generative-model images are not kept in this repository** (a private store; see ADR 0002 D6/D9); this table records each image’s hash, review result, and use.

| Id | Kind | Source / model | Date | Licence | Hash (sha1 / sha256) | Review | Used for |
| --- | --- | --- | --- | --- | --- | --- | --- |
| commons-surprising-face-2022 | pd-cc0 (tier B: uploader-dedicated CC0) | Wikimedia Commons `File:Surprising face of manga 2022-08-30.png` by Asanagi (own work), https://commons.wikimedia.org/wiki/File:Surprising_face_of_manga_2022-08-30.png | 2026-11-23 (checked) | CC0 1.0 (checked on the Commons page); uploader-is-author: plausible, not proven | sha1 3bebdda5c58157885bc56a8cd7142c372be88cdd / sha256 f9dc702180a013cba30274059b1819da113c0eb03cbf3f135b804cb5dc68d2ab | accepted by the owner (2026-11-23): not a real person, not a known character; **domain: out** (`gag-chibi`). reviewer: owner | R5 tool-regression fixture and the spike (`tools/fit/`, `docs/adr/0002-spike-*`); committed in `refs/pd/` with its provenance record; not a gate input (domain out); not for hair (no traced curves ship in v1)
| ai-0001 | ai-generated | gpt-image-2.6-sunburst | 2026-11-23 | — | sha256 5b789c6a3ac93338c4e073a9ad19c1c379c719b94e36863d9a3d9f644a94a78a | accepted by the owner (2026-11-23); domain: young | none |
| ai-0002 | ai-generated | gpt-image-2.6-sunburst | 2026-11-23 | — | sha256 025f12cbb979f0b20813b818d1316ad659760d84b14fba1e8e4d18ae0c55b429 | accepted by the owner (2026-11-23); domain: young | none |

An earlier spike reference (Open Clip Art 'Manga Boy') was removed: its Commons description says it depicts a real person. It remains only in the history of PR #8's branch; the PR is squash-merged, so it never enters main.
