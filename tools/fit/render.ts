// node tools/fit/render.ts < in.json — the fitted face as an SVG group in the reference image's pixel coordinates.
// stdin: {"character", "expression"?, "s", "tx", "ty", "prefix"?}: the fit maps image p to model m = s * p + t, so the group is the inverse of that map.
import fs from 'node:fs';
import {faceFragment, prefixIds, type Character} from '../../src/index.ts';

const i = JSON.parse(fs.readFileSync(0, 'utf8')) as {character: Character; expression?: string; s: number; tx: number; ty: number; prefix?: string};
const body = prefixIds(faceFragment(i.character, i.expression ?? 'neutral').fragment, i.prefix ?? 'fit-');
const k = 1 / i.s;
process.stdout.write(`<g transform="matrix(${k} 0 0 ${k} ${-i.tx * k} ${-i.ty * k})">${body}</g>\n`);
