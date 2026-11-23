// The same characters and cell size are used by the raster gate and the owner’s review tools.
import fs from 'node:fs';
import path from 'node:path';
import {BOX, CHARACTERS, SCALE, SKIN, randomCharacter} from '../src/index.ts';
import type {Character} from '../src/index.ts';

export const OUT = path.join(import.meta.dirname, '../out');
export const STAGE_WIDTH = Math.round(BOX[2] * SCALE);
export const STAGE_HEIGHT = Math.round(BOX[3] * SCALE);

const mature = (skin: string, hair: string): Character => ({
  ...CHARACTERS.m,
  palette: {...CHARACTERS.m.palette, skin, hair},
});

export const showcase = [
  {id: 'young a', ch: CHARACTERS.a},
  {id: 'young b', ch: CHARACTERS.b},
  {id: 'mature/fair/chestnut', ch: mature('fair', 'chestnut')},
  {id: 'mature/dark/black', ch: mature('dark', 'black')},
];

export const randomCases = () => Array.from({length: 64}, (_, seed) => ({id: String(seed), ch: randomCharacter(seed)}));
export const extremes = (['young', 'mature'] as const).flatMap(style => {
  const base = style === 'young' ? CHARACTERS.a : CHARACTERS.m;
  return Object.keys(SKIN).flatMap(skin => ['black', 'blond'].map(hair => ({
    id: `${style}/${skin}/${hair}`,
    ch: {...base, palette: {...base.palette, skin, hair}},
  })));
});

export function reviewCases(dir: string) {
  const filename = path.join(dir, 'measurements.json');
  if (!fs.existsSync(filename)) throw new Error('Missing measurements.json. Run pnpm measure --check first.');
  const {distinguishability} = JSON.parse(fs.readFileSync(filename, 'utf8'));
  const worstRandom = randomCases().find(row => row.id === distinguishability?.worstRandom?.id);
  const worstExtreme = extremes.find(row => row.id === distinguishability?.worstExtreme?.id);
  if (!worstRandom || !worstExtreme) throw new Error('Missing worst cases in measurements.json. Run pnpm measure --check again.');
  return {
    showcase,
    worst: [
      {id: `random seed ${worstRandom.id}`, ch: worstRandom.ch},
      {id: `palette ${worstExtreme.id}`, ch: worstExtreme.ch},
    ],
  };
}
