export function shortHair(sideLen: number) {
  const swept = sideLen <= 20;
  return {length: sideLen, foot: swept ? 8 : 14, width: swept ? 7 : 9, inset: 10,
    tip: swept ? 10 : 15, sweep: swept ? 15 : 9, back: 0};
}
