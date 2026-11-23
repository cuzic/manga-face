// node tools/brow-comparison.ts path/to/baseline/src/index.ts [outdir]
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import * as current from '../src/index.ts';
import {OUT} from './stage-cases.ts';

const [baselinePath, dir = OUT] = process.argv.slice(2);
if (!baselinePath) throw new Error('Supply the baseline src/index.ts to render the before and after crops.');
const baseline: typeof current = await import(pathToFileURL(path.resolve(baselinePath)).href);

fs.mkdirSync(dir, {recursive: true});
for (const [name, version] of [['before', baseline], ['after', current]] as const) {
  const cells = ['surprise', 'think'].map((expression, i) => {
    const face = current.prefixIds(version.faceFragment(version.CHARACTERS.b, expression).fragment, `crop-${i}-`);
    return `<text x="${i * 225 + 110}" y="18" text-anchor="middle">${expression}</text>`
      + `<svg x="${i * 225}" y="26" width="220" height="155" viewBox="65 52 170 120">${face}</svg>`;
  }).join('');
  fs.writeFileSync(path.join(dir, `brows-${name}.svg`),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 445 181" width="445" height="181" font-family="sans-serif" font-size="14"><rect width="100%" height="100%" fill="#ffffff"/>${cells}</svg>\n`);
}
