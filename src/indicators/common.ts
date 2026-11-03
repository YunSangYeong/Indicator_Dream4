export type Series = (number | null)[];
export function smooth(values: Series, period: number, alpha: number): Series {
  const out: Series = Array(values.length).fill(null);
  let seed: number[] = [];
  let prev: number | null = null;
  values.forEach((v, i) => {
    if (v === null) {
      seed = [];
      prev = null;
      return;
    }
    if (prev === null) {
      seed.push(v);
      if (seed.length === period)
        prev = seed.reduce((a, b) => a + b, 0) / period;
    } else prev = alpha * v + (1 - alpha) * prev;
    out[i] = prev;
  });
  return out;
}
export const ema = (v: Series, p: number) => smooth(v, p, 2 / (p + 1));
export const wilder = (v: Series, p: number) => smooth(v, p, 1 / p);
export function sma(v: Series, p: number): Series {
  return v.map((_, i) => {
    const a = v.slice(i - p + 1, i + 1);
    return i >= p - 1 && a.every((x) => x !== null)
      ? (a as number[]).reduce((s, x) => s + x, 0) / p
      : null;
  });
}
