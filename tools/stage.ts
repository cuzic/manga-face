// node tools/stage.ts [outdir] — run pnpm measure --check first, then open stage.svg at 100% zoom.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ADR0074, BOX, faceFragment, prefixIds} from '../src/index.ts';
import type {Character} from '../src/index.ts';
import {OUT, STAGE_HEIGHT, STAGE_WIDTH, reviewCases} from './stage-cases.ts';

export function stageCell(ch: Character, expression: string, id: string, scale = 1, x = 0, y = 0): string {
  return `<svg x="${x}" y="${y}" width="${STAGE_WIDTH * scale}" height="${STAGE_HEIGHT * scale}" viewBox="${BOX.join(' ')}" aria-hidden="true">`
    + `<rect x="${BOX[0]}" y="${BOX[1]}" width="${BOX[2]}" height="${BOX[3]}" fill="#ffffff"/>`
    + prefixIds(faceFragment(ch, expression).fragment, `${id}-`) + '</svg>';
}

export function stage(rows: readonly {id: string; ch: Character}[]): string {
  const labelWidth = 220, gap = 4;
  const width = labelWidth + ADR0074.length * (STAGE_WIDTH * 2 + gap);
  let y = 8;
  let content = '';
  for (const scale of [1, 2]) {
    const w = STAGE_WIDTH * scale, h = STAGE_HEIGHT * scale;
    content += `<text x="8" y="${y + 16}" font-weight="bold">${scale === 1 ? 'Stage size (DPR 1)' : '2× stage size'}</text>`;
    ADR0074.forEach((expression, i) => {
      content += `<text x="${labelWidth + i * (w + gap) + w / 2}" y="${y + 16}" text-anchor="middle">${expression}</text>`;
    });
    y += 24;
    rows.forEach(({id, ch}, row) => {
      content += `<text x="8" y="${y + h / 2}">${id}</text>`;
      content += ADR0074.map((expression, i) =>
        stageCell(ch, expression, `s${scale}-${row}-${i}`, scale, labelWidth + i * (w + gap), y)).join('');
      y += h + gap;
    });
    y += 12;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${y}" width="${width}" height="${y}" font-family="sans-serif" font-size="13" fill="#22201b">`
    + `<rect width="100%" height="100%" fill="#ffffff"/>${content}</svg>\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2] ?? OUT;
  const {showcase, worst} = reviewCases(dir);
  fs.writeFileSync(path.join(dir, 'stage.svg'), stage([...showcase, ...worst]));
}
