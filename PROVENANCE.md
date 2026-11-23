# Provenance of the art

Every part of the art in this repository is original geometry **written as code** (ADR 0001 D6). No generative-model output, no tracing of existing art, no
matching to reference images. Open Peeps and DiceBear are structural references only (the slot layout and the named colour slots); none of their paths is used.

A part is a face outline, an eye kind, a brow, a mouth kind, a nose, a hair template, or a preset. **A PR that adds or changes a part must add or change its row;
`test/provenance.test.ts` fails when a part has no row.**

| Part | Written by | Date | Method | Referenced | Resemblance check |
| --- | --- | --- | --- | --- | --- |
| face outline (`faceSegs`: temple, cheekbone, jaw corner, chin) | coding assistant (Claude) for the owner | 2026-11-22 | geometry written as code from a geometric description (cubic segments from `cheek`, `chin`, `jaw`, `chinW`) | none | owner checkpoint (U0.5) |
| eyes (`eyeSvg`: open, arc, arcDown, cross, dot, half) | coding assistant (Claude) for the owner | 2026-11-22 | geometry written as code (upper and lower lid curves from `w`, `h`, `tilt`; iris clipped to the lid) | none | owner checkpoint (U2) |
| brows (`browSvg`) | coding assistant (Claude) for the owner | 2026-11-22 | geometry written as code (a tapered filled shape from angle and thickness) | none | owner checkpoint (U2) |
| mouths (`mouthSvg`: flat, smile, open, o, frown, wave, omega, grit, tri) | coding assistant (Claude) for the owner | 2026-11-22 | geometry written as code (paths from width and depth) | none | owner checkpoint (U2) |
| nose (dot, line) | coding assistant (Claude) for the owner | 2026-11-22 | geometry written as code | none | owner checkpoint (U2) |
| hair templates (`short`, `bob`) and fringe locks (`hairParts`) | coding assistant (Claude) for the owner | 2026-11-22 | geometry written as code (a silhouette; locks computed from strand count and parting) | none | owner checkpoint (U3) |
| presets (the 8 ADR 0074 expressions and 6 extras) | coding assistant (Claude) for the owner | 2026-11-22 | numbers written as code: deltas on the character's base eyes, brows and mouth | none | owner checkpoint (U2) |
| body, neck, ears (`faceFragment`) | coding assistant (Claude) for the owner | 2026-11-22 | geometry written as code | none | owner checkpoint (U2) |

"Method" is one of: *by a person as code*, *by a coding assistant as code*. Anything else (a generative model's drawing, a trace, a reference-matched adjustment) is not allowed in v1.

## References (ADR 0002; not shipped as art)

References are used for fitting and evaluation only. The shipped art is always our code redrawing from parameters. **Generative-model images are not kept in this repository** (a private store; see ADR 0002 D6/D9); only a row per image (hash, result) will be listed here once the ADR is accepted and generation has started. No generated image exists yet.

| Id | Kind | Source / model | Date | Licence | Hash (sha1 / sha256) | Review | Used for |
| --- | --- | --- | --- | --- | --- | --- | --- |
| openclipart-25619-manga-boy | pd-cc0 | Wikimedia Commons `File:Manga Boy.png` by Astrid Graeber (Open Clip Art Library 25619), https://commons.wikimedia.org/wiki/File:Manga_Boy.png | 2026-11-23 (checked) | CC0 1.0 / PD-OpenClipart (checked on the Commons page) | sha1 b42491da86de0d21289ed6e37c828b87d373bce0 | a person looked at it: a generic front-facing manga boy | spike: potrace + landmark fit (`tools/fit/`, `docs/adr/0002-spike-*`); committed in `refs/pd/` with its provenance record |
