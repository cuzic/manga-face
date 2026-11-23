// @ts-nocheck -- SPIKE, does not run on this branch: it needs faceSegs / flatten / faceHalfWidth (U1's internal modules, imported directly once PR #9 is merged; see ADR 0002 D7) and FragmentOpts.hair (Issue #10).
// The committed outputs (docs/adr/0002-spike-*) are the record of the run on the pre-split code; drop this line and re-run when #9 and #10 are in.
// node tools/fit/landmarks.ts < params.json — the model's landmark positions (model units), the normalized character and its validation, as JSON. The fitter (fit.py) calls this.
// stdin: {"character": <Character>, "expression"?: string}; stdout: {"names", "points", "normalized", "violations"}.
//
// Operational definitions (ADR 0002 D4: the same on both sides, model and reference):
//   chin      the lowest point of the face outline.
//   cheekL/R  the face outline's x at the height eyeline + 0.2 * (chin - eyeline), where eyeline is the mean of the two eye centres' y.
//   earL/R    the outermost point of the ear, at the ear's centre height.
//   eyeX_outer / eyeX_inner   the left-most / right-most point of the eye's lid outline at the eye's centre height (the outer corner is the one away from the face centre; no lash flick).
//   eyeX_top / eyeX_bottom    the highest / lowest ink of the eye (the lid line's outer edge, the lower edge).
//   browL/R   the centre of the bounding box of the brow stroke.
//   noseTip   the tip of the nose mark.
//   mouthL/R  the left-most / right-most point of the mouth outline, at the mouth's vertical centre; mouthC the centre of the mouth outline's bounding box.
// There is no crown landmark: the hair's height belongs to the hair, which is fitted separately (ADR 0002 D5/D6).
import fs from 'node:fs';
import {ADR0074, CX, CY, faceFragment, faceHalfWidth, faceSegs, flatten, normalize, validate, type Character} from '../../src/index.ts';

export const LANDMARK_NAMES = ['chin', 'cheekL', 'cheekR', 'earL', 'earR', 'eyeL_outer', 'eyeL_inner', 'eyeL_top', 'eyeL_bottom', 'eyeR_inner', 'eyeR_outer', 'eyeR_top', 'eyeR_bottom', 'browL', 'browR', 'noseTip', 'mouthL', 'mouthR', 'mouthC'] as const;

/** The landmarks of the model for the character as it is drawn (normalize applied), in the sense of the definitions above. */
export function landmarks(chIn: Character, expression = 'neutral'): [number, number][] {
  const ch = normalize(chIn);
  const f = faceFragment(ch, expression).features;
  const W = ch.head.cheek, ey = CY + ch.eyes.y, g = ch.eyes.gap;
  const [eL, eR] = f.eyes, [bL, bR] = f.brows, m = f.mouth;
  const my = (m.top + m.bottom) / 2;
  const chinY = CY + ch.head.chin + 1;
  const cheekY = ey + 0.2 * (chinY - ey);
  const hw = faceHalfWidth(flatten(faceSegs(ch.head)), cheekY);
  const lash = ch.eyes.lashes ? 11 : 0; // the lash flick is on the outer side and is not part of the lid corner
  return [
    [CX, chinY], [CX - hw, cheekY], [CX + hw, cheekY], [CX - W - 9, CY + 14], [CX + W + 9, CY + 14],
    [eL!.left + lash, ey], [eL!.right, ey], [CX - g, eL!.top], [CX - g, eL!.bottom],
    [eR!.left, ey], [eR!.right - lash, ey], [CX + g, eR!.top], [CX + g, eR!.bottom],
    [(bL!.left + bL!.right) / 2, (bL!.top + bL!.bottom) / 2], [(bR!.left + bR!.right) / 2, (bR!.top + bR!.bottom) / 2],
    [CX, CY + 46], [m.left, my], [m.right, my], [(m.left + m.right) / 2, my],
  ];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = JSON.parse(fs.readFileSync(0, 'utf8')) as {character: Character; expression?: string};
  const expression = input.expression ?? 'neutral';
  // the violations are those of every ADR 0074 expression: a fit must give a character toManifest would accept
  const violations = validate(input.character, ADR0074);
  process.stdout.write(`${JSON.stringify({names: LANDMARK_NAMES, points: landmarks(input.character, expression), normalized: normalize(input.character), violations})}\n`);
}
