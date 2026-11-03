import { ema, type Series } from "./common";
export function macd(close: Series) {
  const fast = ema(close, 12),
    slow = ema(close, 26),
    line = slow.map((v, i) => (v === null ? null : fast[i]! - v)),
    signal = ema(line, 9);
  return {
    macd: line,
    signal,
    histogram: signal.map((v, i) => (v === null ? null : line[i]! - v)),
  };
}
