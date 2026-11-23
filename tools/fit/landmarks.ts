// node tools/fit/landmarks.ts < params.json — the model's 20 landmark positions (model units) for a character, as JSON. The fitter (fit.py) calls this.
// stdin: {"character": <Character>, "expression"?: string}; stdout: {"names": string[], "points": [x, y][]}.
import fs from 'node:fs';
import {CX, CY, faceFragment, normalize, type Character} from '../../src/index.ts';

export const LANDMARK_NAMES = ['chin', 'cheekL', 'cheekR', 'earL', 'earR', 'eyeL_outer', 'eyeL_inner', 'eyeL_top', 'eyeL_bottom', 'eyeR_inner', 'eyeR_outer', 'eyeR_top', 'eyeR_bottom', 'browL', 'browR', 'noseTip', 'mouthL', 'mouthR', 'mouthC', 'crown'] as const;

/** The landmarks of the model, in the same sense as the hand-marked ones of a reference (see docs/adr/0002). Eye corners are the lid corners (without the lash flick). */
export function landmarks(chIn: Character, expression = 'neutral'): [number, number][] {
  const ch = normalize(chIn);
  const f = faceFragment(ch, expression).features;
  const W = ch.head.cheek, ey = CY + ch.eyes.y, g = ch.eyes.gap, w = ch.eyes.w;
  const [eL, eR] = f.eyes, [bL, bR] = f.brows, m = f.mouth;
  const my = (m.top + m.bottom) / 2;
  return [
    [CX, CY + ch.head.chin + 1], [CX - W * 0.985, CY + 30], [CX + W * 0.985, CY + 30], [CX - W, CY + 14], [CX + W, CY + 14],
    [CX - g - w, ey], [CX - g + w, ey], [CX - g, eL!.top], [CX - g, eL!.bottom],
    [CX + g - w, ey], [CX + g + w, ey], [CX + g, eR!.top], [CX + g, eR!.bottom],
    [(bL!.left + bL!.right) / 2, (bL!.top + bL!.bottom) / 2], [(bR!.left + bR!.right) / 2, (bR!.top + bR!.bottom) / 2],
    [CX, CY + 46], [m.left, my], [m.right, my], [(m.left + m.right) / 2, my], [CX, CY - 114],
  ];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = JSON.parse(fs.readFileSync(0, 'utf8')) as {character: Character; expression?: string};
  process.stdout.write(`${JSON.stringify({names: LANDMARK_NAMES, points: landmarks(input.character, input.expression)})}\n`);
}
