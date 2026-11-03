import type { Candle } from "../types";
import { sma } from "./common";
export function stochastic(c: Candle[], period = 14, smoothK = 3, smoothD = 3) {
  const raw = c.map((v, i) => {
    if (i < period - 1) return null;
    const a = c.slice(i - period + 1, i + 1),
      hi = Math.max(...a.map((x) => x.high)),
      lo = Math.min(...a.map((x) => x.low));
    return hi === lo ? 50 : (100 * (v.close - lo)) / (hi - lo);
  });
  const k = sma(raw, smoothK);
  return { k, d: sma(k, smoothD) };
}
