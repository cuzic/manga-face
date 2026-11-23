// @ts-nocheck -- SPIKE, does not run on this branch: it needs faceSegs / flatten / faceHalfWidth (U1's internal modules, imported directly once PR #9 is merged; see ADR 0002 D7) and FragmentOpts.hair (Issue #10).
// The committed outputs (docs/adr/0002-spike-*) are the record of the run on the pre-split code; drop this line and re-run when #9 and #10 are in.
// node tools/fit/render.ts < in.json — the fitted face as an SVG group in the reference image's pixel coordinates.
// stdin: {"character", "expression"?, "s", "tx", "ty", "prefix"?, "hair"?}: the fit maps image p to model m = s * p + t, so the group is the inverse of that map.
import fs from 'node:fs';
import {faceFragment, prefixIds, type Character} from '../../src/index.ts';

const i = JSON.parse(fs.readFileSync(0, 'utf8')) as {character: Character; expression?: string; s: number; tx: number; ty: number; prefix?: string; hair?: boolean};
const body = prefixIds(faceFragment(i.character, i.expression ?? 'neutral', {hair: i.hair !== false}).fragment, i.prefix ?? 'fit-');
const k = 1 / i.s;
process.stdout.write(`<g transform="matrix(${k} 0 0 ${k} ${-i.tx * k} ${-i.ty * k})">${body}</g>\n`);
