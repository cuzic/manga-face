import {browKeyline, browSvg} from './brows.ts';
import {eyeSvg, resolveEye} from './eyes.ts';
import type {Built} from './eyes.ts';
import {CX, CY, dOf, faceSegs, n} from './geometry.ts';
import {hairParts} from './hair.ts';
import {mouthSvg, noseSvg} from './mouths.ts';
import {BLUSH, HAIR, INK, IRIS, MOUTH_IN, PAPER, SHADE_ROSE, SKIN, TONGUE, TOP, WHITE, needsKeyline, nudge, over, pick} from './palette.ts';
import {normalize} from './params.ts';
import type {Character} from './params.ts';
import {PRESETS} from './presets.ts';

const FRINGE_KEYLINE = 8.6;

export interface FragmentOpts {
  /** false: leave out the nose, eyes, brows, mouth and blush; 'lines': only the line features (nose, brows, mouth, and the `^^` `><` dot eyes). The pixel tests compare with and without them. */
  features?: boolean | 'lines';
  /** draw the feature lines without their paper keyline (a negative control for the pixel tests) */
  noFeatureKeyline?: boolean;
  /** leave out one boundary keyline (the pixel tests check that each one changes the picture) */
  noKeyline?: 'hairFace' | 'faceNeck';
}
export interface Fragment {fragment: string; top: number; features: {eyes: Built[]; brows: Built[]; mouth: Built}}
/** One expression of one character, as an SVG fragment in the box's coordinates (shapes, groups, clip paths only). */
export function faceFragment(chIn: Character, expression: string, opts: FragmentOpts = {}): Fragment {
  return faceFragmentRaw(normalize(chIn), expression, opts);
}

/** Builds a fragment from the supplied geometry, without applying parameter constraints. */
export function faceFragmentRaw(ch: Character, expression: string, opts: FragmentOpts = {}): Fragment {
  const pr = PRESETS[expression];
  if (!pr) throw new Error(`unknown expression ${expression}`);
  const taken = new Set<string>([INK, PAPER, WHITE, MOUTH_IN, TONGUE, SHADE_ROSE, BLUSH]);
  const skin = nudge(pick(SKIN, ch.palette.skin), taken); taken.add(skin);
  const hairHex = nudge(pick(HAIR, ch.palette.hair), taken); taken.add(hairHex);
  const topHex = nudge(pick(TOP, ch.palette.top), taken); taken.add(topHex);
  const iris = nudge(pick(IRIS, ch.palette.iris), taken);
  const keyed = needsKeyline(skin) && !opts.noFeatureKeyline;
  const W = ch.head.cheek;
  const face = dOf(faceSegs(ch.head));
  const eye = resolveEye(ch.eyes, pr.eye);
  const eyeY = CY + ch.eyes.y, gap = ch.eyes.gap, mouthY = CY + ch.mouth.y;
  const hair = hairParts(ch.hair, W, hairHex);
  const ink46 = `fill="none" stroke="${INK}" stroke-width="4.6" stroke-linejoin="round"`;
  const bodyD = 'M20 360C20 292 64 262 118 252Q150 270 182 252C236 262 280 292 280 360Z';
  const body = `<path d="${bodyD}" fill="${topHex}" stroke="${INK}" stroke-width="4.6" stroke-linejoin="round"/><path d="M118 252Q${CX} 296 182 252" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>`;
  const neckD = `M${CX - 24} ${CY + 70}L${CX - 24} ${CY + 118}Q${CX} ${CY + 136} ${CX + 24} ${CY + 118}L${CX + 24} ${CY + 70}Z`;
  // face-neck keyline: the chin line gets a paper stroke, clipped to the neck itself (the face is painted over its inner half)
  const neck = `<clipPath id="nk"><path d="${neckD}"/></clipPath><path d="${neckD}" fill="${skin}"/>${over(`path d="${neckD}"`, SHADE_ROSE, 0.28)}<path d="${neckD}" ${ink46}/>`
    + (opts.noKeyline === 'faceNeck' ? '' : `<g clip-path="url(#nk)"><path d="${face}" fill="none" stroke="${PAPER}" stroke-width="8.6"/></g>`);
  const ears = [-1, 1].map(s => `<ellipse cx="${CX + s * W}" cy="${CY + 14}" rx="9" ry="15" fill="${skin}" stroke="${INK}" stroke-width="4"/>`).join('');
  const faceFill = `<clipPath id="fc"><path d="${face}"/></clipPath><path d="${face}" fill="${skin}"/><g clip-path="url(#fc)">${hair.skinShade}</g><path d="${face}" ${ink46}/>`;
  const F = opts.features !== false, lines = opts.features === 'lines';
  const nose = F ? noseSvg(ch.nose, keyed) : '';
  const blush = F && !lines && pr.blush ? [-1, 1].map(s => [0, 1, 2].map(i => `<path d="M${n(CX + s * (W - 34) + i * 7 - 8)} ${CY + 54}l6 -10" fill="none" stroke="${BLUSH}" stroke-opacity="0.65" stroke-width="3" stroke-linecap="round"/>`).join('')).join('') : '';
  const eL = eyeSvg(eye, -1, CX - gap, eyeY, iris, 'el', keyed), eR = eyeSvg(eye, 1, CX + gap, eyeY, iris, 'er', keyed);
  const bL = browSvg(pr.brow, ch.brows.thick, -1, CX - gap, eyeY, ch.eyes.h, ch.brows.dy), bR = browSvg(pr.brow, ch.brows.thick, 1, CX + gap, eyeY, ch.eyes.h, ch.brows.dy);
  const mo = mouthSvg(pr.mouth, ch.mouth.w, mouthY, 'mo', keyed);
  // hair-face keyline: the edge of the mass and of every lock, on the face's side (paper | ink); the hair's own side is dark and has the ink line alone
  const keyHair = opts.noKeyline === 'hairFace' ? '' : `<clipPath id="kc"><path d="${face}"/></clipPath><g clip-path="url(#kc)" fill="none" stroke="${PAPER}" stroke-width="${FRINGE_KEYLINE}" stroke-linejoin="round">${hair.lockStroke}</g>`;
  const lineEye = lines && !['arc', 'arcDown', 'cross', 'dot'].includes(eye.kind);
  const feat = nose + (lineEye ? '' : eL.svg + eR.svg) + mo.svg;
  // The hair covers the skin-side brow underlay. The hair-side underlay follows the fringe width and stays inside the mass and locks.
  const skinBrowKey = F && keyed ? `<g clip-path="url(#fc)">${browKeyline(bL.path)}${browKeyline(bR.path)}</g>` : '';
  const hairBrowKey = F && !opts.noFeatureKeyline && needsKeyline(hairHex)
    ? `<clipPath id="bk">${hair.lockStroke}</clipPath><g clip-path="url(#bk)">${browKeyline(bL.path, FRINGE_KEYLINE)}${browKeyline(bR.path, FRINGE_KEYLINE)}</g>`
    : '';
  const inner = hair.back + body + neck + ears + faceFill + blush + keyHair + skinBrowKey
    + hair.clipDefs + hair.mass + hair.locks + hair.lockShade + (F ? feat + hairBrowKey + bL.built.svg + bR.built.svg : '');
  const fragment = ch.mirror ? `<g transform="translate(300 0) scale(-1 1)">${inner}</g>` : inner;
  return {fragment, top: n(hair.top), features: {eyes: [eL, eR], brows: [bL.built, bR.built], mouth: mo}};
}
