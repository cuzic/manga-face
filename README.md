# manga-face

Parametric manga-style faces as SVG. The output is a `CharacterManifest` that [svg-diagram](https://github.com/cuzic/svg-diagram)'s `comic()` takes as it is
(`comic(sheet, {characters: {id: manifest}})`).

- A front-facing head from numbers (face outline, eyes, brows, mouth, nose, hair) in two styles: `young` (the default) and `mature` (`style: 'mature'`).
- Expressions are presets: deltas on the character's own eyes, brows and mouth. The 8 expressions of svg-diagram's `comic()` and 6 extras.
- Deterministic: the same parameters give byte-identical SVG on every Node and in the browser. Seeded random characters.
- Pure ESM, no `node:*`, `sideEffects: false` (tree-shakeable). Runs in the browser.

Status: **in development**, started from the spike of svg-diagram's ADR 0079. The design is `docs/adr/0001-manga-face.md`. Nothing is published to npm yet.

```ts
import {defaultCharacter, toManifest} from 'manga-face';   // not published yet: import from ./src/index.ts

const manifest = toManifest(defaultCharacter({style: 'young', palette: {skin: 'medium', hair: 'black'}}));
// comic(sheet, {characters: {[manifest.id]: manifest}})
```

`validate(character)` returns an array of violations with a `group`, a `code`, a human-readable `message`, and an `expression` when the check applies to a specific expression. An empty array means the character is valid. Validation checks numeric fields, strand counts, and palette values on the input, then checks geometry after normalization. Numeric fields must be finite numbers, and range bounds allow floating-point error up to `1e-9`. `toManifest(character)` throws with the violation messages if validation fails.

`validateRaw(character, expressions?)` checks the supplied geometry directly, without normalization or range, strand-count, and palette validation. It checks the eight comic expressions by default.

## Development

```sh
pnpm install
pnpm typecheck && pnpm lint && pnpm test
pnpm golden          # compare goldens/*.svg with a rebuild (pnpm golden:write after an intended change of the look)
pnpm gallery         # out/gallery.svg, out/extras.svg, out/directions.svg
pnpm measure --check # needs Playwright Chromium. Writes out/measurements.json and fails if a check fails.
node tools/stage.ts  # out/stage.svg at stage size and 2×
node tools/blind.ts  # out/blind.html and the scorer’s out/blind-key.json
```

`pnpm measure --check` checks stage-scale distinguishability and pixels, top anchors, minimum stroke width, determinism, sampler validity, the comic sample, and compatibility when replacing built-in faces. The pixel grid covers young short hair, mirrored young bob, and mature, each with every named skin and hair colour.

For the stage-size blind review, share `blind.html` with the reviewer. Each card draws an expression independently, so an expression can repeat. Keep the locally generated `blind-key.json` with the scorer and load it after all cards have been answered. CI publishes `blind.html` in `stage-review`.

Work is done by agents from task specs (Issues titled `[codex] …`): see `AGENTS.md`.

## Licences

- **Code: MIT** (`LICENSE`).
- **The art that the code generates (the SVG, the manifests, the goldens): CC0-1.0** (public domain dedication). The manifests carry `license: {spdx: 'CC0-1.0', …}`.
- All art is original geometry written as code. No generative-model output, no tracing, no reference-matched art; `PROVENANCE.md` records each part.
