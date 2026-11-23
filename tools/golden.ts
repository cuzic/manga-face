// node tools/golden.ts [--write] — the goldens: 6 cells of the gallery as plain SVG (3 expressions x 2 reference characters), compared byte for byte.
// Faces have no text, so no fonts are involved and the same bytes come out on every machine. Change a golden only for an intended change of the look.
import fs from 'node:fs';
import path from 'node:path';
import {BOX, CHARACTERS, faceFragment, type Character} from '../src/face.ts';

const dir = path.join(import.meta.dirname, '../goldens');
const CELLS: readonly (readonly [string, Character, string])[] = [
  ...(['neutral', 'smile', 'angry'] as const).map(e => [`young-short-${e}`, {...structuredClone(CHARACTERS.a), mirror: false} as Character, e] as const),
  ...(['neutral', 'smile', 'angry'] as const).map(e => [`young-bob-${e}`, {...structuredClone(CHARACTERS.b), mirror: false} as Character, e] as const),
];
export const cellSvg = (ch: Character, expression: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${BOX.join(' ')}" width="${BOX[2]}" height="${BOX[3]}"><rect x="${BOX[0]}" y="${BOX[1]}" width="${BOX[2]}" height="${BOX[3]}" fill="#ffffff"/>${faceFragment(ch, expression).fragment}</svg>\n`;
export const goldens = (): Record<string, string> => Object.fromEntries(CELLS.map(([name, ch, e]) => [`${name}.svg`, cellSvg(ch, e)]));

if (import.meta.url === `file://${process.argv[1]}`) {
  const write = process.argv.includes('--write');
  fs.mkdirSync(dir, {recursive: true});
  let bad = 0;
  for (const [file, svg] of Object.entries(goldens())) {
    const p = path.join(dir, file);
    if (write) { fs.writeFileSync(p, svg); continue; }
    if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== svg) { console.error(`golden differs: goldens/${file}`); bad++; }
  }
  if (bad) { console.error(`${bad} golden(s) differ. If the change of the look is intended: node tools/golden.ts --write, and show before / after in the PR.`); process.exit(1); }
  console.log(write ? 'goldens written' : 'goldens match');
}
