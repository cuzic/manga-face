// ---- colours: the comic's own ink and paper (ADR 0074 D6), the three base slots, and tones that are opacity overlays (no derived hex)
/** The comic's ink and paper (`PALETTE.text`, `PALETTE.bg` of lib/tokens.ts; copied so the package has no run-time import of svg-diagram). */
export const INK = '#22201b', PAPER = '#ffffff', WHITE = '#ffffff';
export const MOUTH_IN = '#8a3340', TONGUE = '#ee7f8c', SHADE_ROSE = '#c0707a', BLUSH = '#ee6f7a';
/** ADR 0076 D4's named palettes (skin / hair / top), plus the iris names of this library. A palette slot takes a key or a `#rrggbb`. */
export const SKIN = {fair: '#ffe3c8', light: '#f6d0a8', medium: '#e2ab7c', tan: '#c98c5c', brown: '#9c6341', dark: '#6e4430'} as const;
export const HAIR = {black: '#1f1f24', brown: '#4a3322', chestnut: '#7d4a2b', blond: '#d2a640', gray: '#9097a3', navy: '#2d3f66'} as const;
export const TOP = {navy: '#3b5b92', blue: '#5b8ed6', teal: '#2f8f8a', green: '#5a9a52', yellow: '#e0b43a', orange: '#e0833a', red: '#c8473f', purple: '#7a58b0', gray: '#7b8290'} as const;
export const IRIS = {brown: '#7a4a2e', blue: '#4f86c6', green: '#4f9a6a', gray: '#7a869a'} as const;
export const HEX = /^#[0-9a-fA-F]{6}$/;
export const pick = (t: Record<string, string>, k: string): string => (t[k] ?? k).toLowerCase();
/** sRGB -> linear, as a literal table of the 256 byte values (no `**`). */
const LIN: readonly number[] = [
  0, 0.00030353, 0.00060705, 0.00091058, 0.00121411, 0.00151763, 0.00182116, 0.00212469,
  0.00242822, 0.00273174, 0.00303527, 0.00334654, 0.00367651, 0.00402472, 0.00439144, 0.00477695,
  0.00518152, 0.00560539, 0.00604883, 0.00651209, 0.00699541, 0.00749903, 0.00802319, 0.00856813,
  0.00913406, 0.00972122, 0.01032982, 0.01096009, 0.01161225, 0.01228649, 0.01298303, 0.01370208,
  0.01444384, 0.01520851, 0.01599629, 0.01680738, 0.01764195, 0.01850022, 0.01938236, 0.02028856,
  0.02121901, 0.02217388, 0.02315337, 0.02415763, 0.02518686, 0.02624122, 0.02732089, 0.02842604,
  0.02955683, 0.03071344, 0.03189603, 0.03310477, 0.03433981, 0.03560131, 0.03688945, 0.03820437,
  0.03954624, 0.0409152, 0.04231141, 0.04373503, 0.0451862, 0.04666509, 0.04817182, 0.04970657,
  0.05126946, 0.05286065, 0.05448028, 0.05612849, 0.05780543, 0.05951124, 0.06124605, 0.06301002,
  0.06480327, 0.06662594, 0.06847817, 0.0703601, 0.07227185, 0.07421357, 0.07618538, 0.07818742,
  0.08021982, 0.08228271, 0.08437621, 0.08650046, 0.08865559, 0.09084171, 0.09305896, 0.09530747,
  0.09758735, 0.09989873, 0.10224173, 0.10461648, 0.1070231, 0.10946171, 0.11193243, 0.11443537,
  0.11697067, 0.11953843, 0.12213877, 0.12477182, 0.12743768, 0.13013648, 0.13286832, 0.13563333,
  0.13843162, 0.14126329, 0.14412847, 0.14702727, 0.14995979, 0.15292615, 0.15592646, 0.15896084,
  0.16202938, 0.16513219, 0.1682694, 0.1714411, 0.1746474, 0.17788842, 0.18116424, 0.18447499,
  0.18782077, 0.19120168, 0.19461783, 0.19806932, 0.20155625, 0.20507874, 0.20863687, 0.21223076,
  0.2158605, 0.2195262, 0.22322796, 0.22696587, 0.23074005, 0.23455058, 0.23839757, 0.24228112,
  0.24620133, 0.25015828, 0.25415209, 0.25818285, 0.26225066, 0.2663556, 0.27049779, 0.27467731,
  0.27889426, 0.28314874, 0.28744084, 0.29177065, 0.29613827, 0.30054379, 0.30498731, 0.30946892,
  0.31398871, 0.31854678, 0.32314321, 0.3277781, 0.33245154, 0.33716362, 0.34191442, 0.34670406,
  0.3515326, 0.35640014, 0.36130678, 0.3662526, 0.37123768, 0.37626212, 0.38132601, 0.38642943,
  0.39157248, 0.39675523, 0.40197778, 0.40724021, 0.41254261, 0.41788507, 0.42326767, 0.4286905,
  0.43415364, 0.43965717, 0.44520119, 0.45078578, 0.45641102, 0.462077, 0.4677838, 0.4735315,
  0.47932018, 0.48514994, 0.49102085, 0.496933, 0.50288646, 0.50888132, 0.51491767, 0.52099557,
  0.52711513, 0.5332764, 0.53947949, 0.54572446, 0.5520114, 0.55834039, 0.56471151, 0.57112483,
  0.57758044, 0.58407842, 0.59061884, 0.59720179, 0.60382734, 0.61049557, 0.61720656, 0.62396039,
  0.63075714, 0.63759687, 0.64447968, 0.65140564, 0.65837482, 0.6653873, 0.67244316, 0.67954247,
  0.68668531, 0.69387176, 0.70110189, 0.70837578, 0.7156935, 0.72305513, 0.73046074, 0.73791041,
  0.74540421, 0.75294222, 0.7605245, 0.76815115, 0.77582222, 0.78353779, 0.79129794, 0.79910274,
  0.80695226, 0.81484657, 0.82278575, 0.83076988, 0.83879901, 0.84687323, 0.85499261, 0.86315721,
  0.87136712, 0.8796224, 0.88792312, 0.89626935, 0.90466117, 0.91309865, 0.92158186, 0.93011086,
  0.93868573, 0.94730654, 0.95597335, 0.96468625, 0.97344529, 0.98225055, 0.9911021, 1,
];

// biome-ignore lint/style/noNonNullAssertion: Each hexadecimal byte in a color indexes the complete 256-entry table.
const lum = (h: string): number => 0.2126 * LIN[Number.parseInt(h.slice(1, 3), 16)]! + 0.7152 * LIN[Number.parseInt(h.slice(3, 5), 16)]! + 0.0722 * LIN[Number.parseInt(h.slice(5, 7), 16)]!;
export const contrast = (a: string, b: string): number => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** Feature lines are graphics, so WCAG 1.4.11's 3:1 applies (not the text rule 4.5:1): where the ink is under 3:1 against what it lies on, a paper line goes under it. */
export const KEY_BELOW = 3;
export const needsKeyline = (fillHex: string): boolean => contrast(INK, fillHex) < KEY_BELOW;
/** Moves a base colour by one unit, inside 000000..ffffff, until it is not one of the other colours the fragment uses. */
export const nudge = (hex: string, taken: Set<string>): string => {
  let v = Number.parseInt(hex.slice(1), 16); const dir = v >= 0xfffff0 ? -1 : 1;
  while (taken.has(`#${v.toString(16).padStart(6, '0')}`)) v += dir;
  return `#${v.toString(16).padStart(6, '0')}`;
};

export const over = (shape: string, fill: string, op: number): string => `<${shape} fill="${fill}" fill-opacity="${op}"/>`;
