export interface Person {
  id: string;
  min: number;
  median: number;
  pair: string;
}

export type Distribution = Record<'showcase' | 'random' | 'extremes', readonly Person[]>;

export const FEATURE_MIN_FRACTION = 0.85;
export const KEYLINE_MIN_PIXELS = 100;

export const median = (sorted: readonly number[]): number => {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

const summarize = (people: readonly Person[]) => {
  const mins = people.map(person => person.min).sort((a, b) => a - b);
  return {
    n: mins.length,
    min: mins[0]!,
    p10: mins[Math.floor(mins.length * 0.1)]!,
    median: median(mins),
    below6: mins.filter(min => min < 6).length,
  };
};

export const lowest = (people: readonly Person[]): Person =>
  people.reduce((worst, person) => person.min < worst.min ? person : worst);

const display = ({id, min, pair}: Person) => `${id}: ${min.toFixed(3)} (${pair})`;

export function judge({showcase, random, extremes}: Distribution) {
  const sampled = [...random, ...extremes];
  const relative = [...showcase, ...sampled].map(person => ({...person, ratio: person.min / person.median}));
  const worstRelative = relative.reduce((worst, person) => person.ratio < worst.ratio ? person : worst);
  const distribution = {showcase: summarize(showcase), random: summarize(random), extremes: summarize(extremes)};
  const describe = (people: readonly Person[], floor: number) => {
    const failures = people.filter(person => person.min < floor);
    return (failures.length ? failures : [lowest(people)]).map(display).join(', ');
  };

  return [
    {criterion: '① Showcase minimum ≥ 6', pass: distribution.showcase.min >= 6, value: describe(showcase, 6)},
    {criterion: '② Random and palette minimum ≥ 3.5', pass: lowest(sampled).min >= 3.5,
      value: [describe(random, 3.5), describe(extremes, 3.5)].join(', ')},
    {criterion: '③ Minimum ≥ 0.5 × own median', pass: relative.every(person => person.min >= 0.5 * person.median),
      value: (worstRelative.ratio < 0.5 ? relative.filter(person => person.ratio < 0.5) : [worstRelative])
        .map(person => `${display(person)} / ${person.median.toFixed(3)} = ${person.ratio.toFixed(3)}`).join(', ')},
    {criterion: '④ Distribution reported', pass: true, value: `${showcase.length} showcase, ${random.length} random, ${extremes.length} palette`, distribution},
  ] as const;
}

interface FeaturePixels {
  worst: {id: string; fraction: number};
  totalFraction: number;
}

export function judgePixels(features: FeaturePixels, control: FeaturePixels,
  {hairFace, faceNeck}: {hairFace: readonly number[]; faceNeck: readonly number[]}) {
  const passesContrast = ({worst, totalFraction}: FeaturePixels) =>
    worst.fraction >= FEATURE_MIN_FRACTION && totalFraction >= 0.95;
  const percent = (value: number) => `${(100 * value).toFixed(2)}%`;
  const displayPixels = ({worst, totalFraction}: FeaturePixels) =>
    `${percent(worst.fraction)} (${worst.id}), total ${percent(totalFraction)}`;

  return [
    {criterion: '⑤ Feature lines ≥ 85% each and ≥ 95% overall, control fails',
      pass: passesContrast(features) && !passesContrast(control),
      value: `${displayPixels(features)}; control: ${displayPixels(control)}`},
    {criterion: '⑥ Boundary keylines change ≥ 100 px each',
      pass: [...hairFace, ...faceNeck].every(pixels => pixels >= KEYLINE_MIN_PIXELS),
      value: `hair/face: ${hairFace.join(', ')} px; face/neck: ${faceNeck.join(', ')} px`},
  ] as const;
}
