import type { Candle } from "../types";
import { wilder, type Series } from "./common";
export function dmi(c: Candle[], p = 14) {
  const tr: Series = [null],
    up: Series = [null],
    down: Series = [null];
  for (let i = 1; i < c.length; i++) {
    const a = c[i],
      b = c[i - 1],
      u = a.high - b.high,
      d = b.low - a.low;
    tr.push(
      Math.max(
        a.high - a.low,
        Math.abs(a.high - b.close),
        Math.abs(a.low - b.close),
      ),
    );
    up.push(u > d && u > 0 ? u : 0);
    down.push(d > u && d > 0 ? d : 0);
  }
  const atr = wilder(tr, p),
    pu = wilder(up, p),
    pd = wilder(down, p);
  const plus = atr.map((a, i) =>
      a === null ? null : a === 0 ? 0 : (100 * pu[i]!) / a,
    ),
    minus = atr.map((a, i) =>
      a === null ? null : a === 0 ? 0 : (100 * pd[i]!) / a,
    );
  const dx = plus.map((v, i) =>
    v === null
      ? null
      : v + minus[i]! === 0
        ? 0
        : (100 * Math.abs(v - minus[i]!)) / (v + minus[i]!),
  );
  return { plus, minus, adx: wilder(dx, p) };
}
