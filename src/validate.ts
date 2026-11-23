import {ADR0074} from './features.ts';
import {faceFragmentRaw} from './fragment.ts';
import {CX, CY, HEAD_R, faceHalfWidth, faceSegs, flatten, n, selfIntersects} from './geometry.ts';
import {hairParts} from './hair.ts';
import {HAIR, HEX, IRIS, SKIN, TOP} from './palette.ts';
import {HAIR_TEMPLATES, RANGES, get, normalize} from './params.ts';
import type {Character, RangeKey} from './params.ts';
import {DIRECTIONS} from './styles.ts';

export interface Violation {
  group: 'head' | 'eyes' | 'brows' | 'mouth' | 'hair' | 'palette';
  code: string;
  expression?: string;
  message: string;
}

const RANGE_EPSILON = 1e-9;

/** Checks the original input ranges and palette, then the normalized geometry (ADR 0001 D2). */
export function validate(ch: Character, expressions: readonly string[] = ADR0074): Violation[] {
  const out: Violation[] = [];
  let hasInvalidNumber = false;
  if (!Number.isInteger(ch.hair.strands) || ch.hair.strands < 1) {
    out.push({group: 'hair', code: 'strands', message: 'hair.strands must be an integer >= 1'});
  }
  for (const key of Object.keys(RANGES) as RangeKey[]) {
    const v = get(ch, key), [lo, hi] = RANGES[key];
    const group = key.split('.')[0] as Violation['group'];
    if (!Number.isFinite(v)) {
      hasInvalidNumber = true;
      out.push({group, code: 'range', message: `${key} must be a finite number`});
    } else if (v < lo - RANGE_EPSILON || v > hi + RANGE_EPSILON) {
      out.push({group, code: 'range', message: `${key}=${v} is outside ${lo}..${hi}`});
    }
  }
  const tables = {skin: SKIN, hair: HAIR, top: TOP, iris: IRIS};
  for (const slot of ['skin', 'hair', 'top', 'iris'] as const) {
    const v = ch.palette[slot];
    if (!(v in tables[slot]) && !HEX.test(v)) {
      out.push({group: 'palette', code: 'palette', message: `palette.${slot}=${JSON.stringify(v)} is neither a known key nor #rrggbb`});
    }
  }
  if (hasInvalidNumber || out.some(violation => violation.group === 'palette')) return out;
  return out.concat(validateRaw(normalize(ch), expressions));
}

/** Checks the supplied geometry without applying ranges or dependent constraints. */
export function validateRaw(ch: Character, expressions: readonly string[] = ADR0074): Violation[] {
  const out: Violation[] = [];
  const face = flatten(faceSegs(ch.head));
  if (selfIntersects(face)) out.push({group: 'head', code: 'face-self-intersect', message: 'the face outline crosses itself'});
  if (Math.max(...face.filter(p => p[1] > CY - 20).map(p => Math.sqrt((p[0] - CX) * (p[0] - CX) + (p[1] - CY) * (p[1] - CY)))) > HEAD_R + 0.5) {
    out.push({group: 'head', code: 'head-circle', message: 'the chin or cheek leaves the head circle'});
  }
  if (!HAIR_TEMPLATES.includes(ch.hair.template)) {
    out.push({group: 'hair', code: 'hair-template', message: 'hair.template must be short, bob, long, or wavy'});
    return out;
  }
  const hp = hairParts(ch.hair, ch.head.cheek, '#000000').polys;
  for (const [part, poly] of Object.entries(hp)) {
    if (part !== 'ahoge' && selfIntersects(poly)) {
      out.push({group: 'hair', code: 'hair-self-intersect', message: `hair ${part} crosses itself`});
    }
  }
  const eyeY = CY + ch.eyes.y;
  const eyeLimit = faceHalfWidth(face, eyeY) - 4;
  const mouthHalfWidth = faceHalfWidth(face, CY + ch.mouth.y);
  for (const expression of expressions) {
    const {eyes, brows, mouth} = faceFragmentRaw(ch, expression).features;
    for (const eye of eyes) {
      const far = Math.max(Math.abs(eye.right - CX), Math.abs(eye.left - CX));
      const near = Math.min(Math.abs(eye.right - CX), Math.abs(eye.left - CX));
      if (far > eyeLimit) {
        out.push({group: 'eyes', code: 'eye-outside-face', expression, message: `${expression}: an eye leaves the face (${n(far)} > ${n(eyeLimit)})`});
      }
      if (near < 4) {
        out.push({group: 'eyes', code: 'eyes-touch', expression, message: `${expression}: the eyes touch at the centre`});
      }
    }
    let defaultBrows: typeof brows | undefined;
    brows.forEach((brow, i) => {
      // biome-ignore lint/style/noNonNullAssertion: The fragment builds one brow and one eye per side in the same order.
      const eyeTop = eyes[i]!.top + 1;
      if (brow.bottom > eyeTop) {
        // Use the same eyes to check whether restoring the default brows clears the overlap.
        defaultBrows ??= faceFragmentRaw({...ch, brows: DIRECTIONS.young.brows}, expression).features.brows;
        // biome-ignore lint/style/noNonNullAssertion: The replacement uses the original side order.
        const group = defaultBrows[i]!.bottom > eyeTop ? 'eyes' : 'brows';
        out.push({group, code: 'brow-into-eye', expression, message: `${expression}: a brow reaches into its eye (${n(brow.bottom)} > ${n(eyeTop)})`});
      }
      if (brow.top < CY - 100) {
        out.push({group: 'brows', code: 'brow-outside-head', expression, message: `${expression}: a brow leaves the head`});
      }
    });
    if (mouth.left < CX - mouthHalfWidth + 6 || mouth.right > CX + mouthHalfWidth - 6) {
      out.push({group: 'mouth', code: 'mouth-outside-face', expression, message: `${expression}: the mouth leaves the face`});
    }
    if (mouth.bottom > CY + ch.head.chin - 4) {
      out.push({group: 'mouth', code: 'mouth-reaches-chin', expression, message: `${expression}: the mouth reaches the chin`});
    }
    if (!(mouth.left <= CX && CX <= mouth.right)) {
      out.push({group: 'mouth', code: 'mouth-anchor', expression, message: `${expression}: the mouth anchor x is outside the mouth`});
    }
    if (mouth.top < eyeY + 20) {
      out.push({group: 'mouth', code: 'mouth-near-eyes', expression, message: `${expression}: the mouth is too close to the eyes`});
    }
  }
  return out;
}
