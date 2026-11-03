import {
  NAMES,
  type Analysis,
  type Candle,
  type Direction,
  type Event,
  type IndicatorName,
  type Score,
  type Settings,
} from "./types";
import { dmi } from "./indicators/dmi";
import { stochastic } from "./indicators/stochastic";
import { chaikin } from "./indicators/chaikin";
import { macd } from "./indicators/macd";
import type { Series } from "./indicators/common";
export function crosses(
  a: Series,
  b: Series,
  qualify: (i: number, d: Direction) => boolean = () => true,
): Event[] {
  const out: Event[] = [];
  for (let i = 1; i < a.length; i++) {
    if ([a[i - 1], b[i - 1], a[i], b[i]].some((v) => v === null)) continue;
    const direction =
      a[i - 1]! <= b[i - 1]! && a[i]! > b[i]!
        ? "LONG"
        : a[i - 1]! >= b[i - 1]! && a[i]! < b[i]!
          ? "SHORT"
          : null;
    if (direction && qualify(i, direction)) out.push({ index: i, direction });
  }
  return out;
}
export function scoreAt(
  events: Record<IndicatorName, Event[]>,
  candles: Candle[],
  index: number,
  window: number,
  direction: Direction,
): Score {
  const votes = {} as Score["votes"];
  let lastIndex: number | null = null;
  let score = 0;
  for (const name of NAMES) {
    const last = events[name].findLast((e) => e.index <= index);
    const valid =
      !!last && index - last.index < window && last.direction === direction;
    votes[name] = {
      point: valid ? 1 : 0,
      time: last ? candles[last.index].time : null,
      age: last ? index - last.index : null,
      lastDirection: last?.direction ?? null,
    };
    if (valid) {
      score++;
      lastIndex = Math.max(lastIndex ?? -1, last!.index);
    }
  }
  return {
    score,
    votes,
    lastTime: lastIndex === null ? null : candles[lastIndex].time,
    age: lastIndex === null ? null : index - lastIndex,
  };
}
export function analyze(
  symbol: string,
  symbolType: string | undefined,
  c: Candle[],
  s: Settings,
): Analysis {
  if (c.length < 300) throw new Error(`확정봉 부족: ${c.length}/300봉`);
  const dm = dmi(c),
    st = stochastic(c),
    co = chaikin(c),
    ma = macd(c.map((x) => x.close)),
    zero = c.map(() => 0);
  const events = {
    DMI: crosses(dm.plus, dm.minus),
    STOCH: crosses(st.k, st.d, (i, dir) =>
      dir === "LONG"
        ? Math.min(st.k[i - 1]!, st.k[i]!) <= s.oversold
        : Math.max(st.k[i - 1]!, st.k[i]!) >= s.overbought,
    ),
    CO: crosses(co.co, zero),
    MACD: crosses(ma.histogram, zero),
  };
  const n = c.length - 1;
  const latest = (a: Series) => a[n];
  return {
    symbol,
    symbolType,
    candles: c,
    events,
    values: {
      plus: latest(dm.plus),
      minus: latest(dm.minus),
      adx: latest(dm.adx),
      k: latest(st.k),
      d: latest(st.d),
      co: latest(co.co),
      macd: latest(ma.macd),
      signal: latest(ma.signal),
      histogram: latest(ma.histogram),
    },
    directions: {
      LONG: scoreAt(events, c, n, s.window, "LONG"),
      SHORT: scoreAt(events, c, n, s.window, "SHORT"),
    },
    history: c.slice(-s.window).map((v, i) => {
      const index = c.length - s.window + i;
      return {
        time: v.time,
        LONG: scoreAt(events, c, index, s.window, "LONG").score,
        SHORT: scoreAt(events, c, index, s.window, "SHORT").score,
      };
    }),
  };
}
export type ViewMode = "threshold" | "four" | "top5" | "all";
export function selectResults(
  results: Analysis[],
  direction: Direction | "ALL",
  minimum: number,
  mode: ViewMode,
) {
  return results
    .flatMap((a) =>
      (["LONG", "SHORT"] as Direction[])
        .filter((d) => direction === "ALL" || d === direction)
        .map((d) => ({ analysis: a, direction: d, ...a.directions[d] })),
    )
    .filter((r) => mode === "all" || r.score >= (mode === "four" ? 4 : minimum))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.lastTime ?? -Infinity) - (a.lastTime ?? -Infinity) ||
        a.analysis.symbol.localeCompare(b.analysis.symbol) ||
        a.direction.localeCompare(b.direction),
    )
    .slice(0, mode === "top5" ? 5 : Infinity);
}
