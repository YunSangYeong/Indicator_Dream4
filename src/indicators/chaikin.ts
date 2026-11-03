import type { Candle } from "../types";
import { ema } from "./common";
export function chaikin(c: Candle[]) {
  let sum = 0;
  const ad = c.map(
    (v) =>
      (sum +=
        (v.high === v.low
          ? 0
          : (v.close - v.low - (v.high - v.close)) / (v.high - v.low)) *
        v.volume),
  );
  const fast = ema(ad, 3),
    slow = ema(ad, 10);
  return { ad, co: slow.map((v, i) => (v === null ? null : fast[i]! - v)) };
}
