import { describe, it, expect, vi } from "vitest";
import { matchesMarket } from "./market";
import { parseCandles, BybitClient } from "./api";
import { dmi } from "./indicators/dmi";
import { stochastic } from "./indicators/stochastic";
import { chaikin } from "./indicators/chaikin";
import { macd } from "./indicators/macd";
import { ema } from "./indicators/common";
import { crosses, scoreAt, analyze, selectResults } from "./scoring";
import { scan } from "./scanner";
import {
  DEFAULT_SETTINGS,
  type Candle,
  type Event,
  type IndicatorName,
} from "./types";
export const bars = (n = 340): Candle[] =>
  Array.from({ length: n }, (_, i) => ({
    time: (i + 1) * 900000,
    open: 100 + i,
    high: 102 + i,
    low: 98 + i,
    close: 101 + i,
    volume: 10,
    turnover: 999999,
  }));
const events = (): Record<IndicatorName, Event[]> => ({
  DMI: [],
  STOCH: [],
  CO: [],
  MACD: [],
});
describe("market and input integrity", () => {
  it("uses only official symbolType, preserves unknowns in all", () => {
    for (const type of ["", "innovation"]) {
      expect(matchesMarket(type, "crypto")).toBe(true);
      expect(matchesMarket(type, "stock")).toBe(false);
    }
    expect(matchesMarket("stock", "stock")).toBe(true);
    for (const type of [undefined, "ETF", "commodity", "forex", "unknown"]) {
      expect(matchesMarket(type, "all")).toBe(true);
      expect(matchesMarket(type, "crypto")).toBe(false);
      expect(matchesMarket(type, "stock")).toBe(false);
    }
  });
  it("parses actual volume separately from turnover, sorts and rejects invalid data", () => {
    const row = ["900000", "2", "3", "1", "2", "7", "900"];
    expect(parseCandles([row])[0]).toMatchObject({ volume: 7, turnover: 900 });
    expect(() => parseCandles([row, row])).toThrow("중복");
    expect(() => parseCandles([[...row.slice(0, 5), "-1", "900"]])).toThrow();
  });
  it("excludes forming bars using server time, preserves session gaps", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          retCode: 0,
          result: {
            symbol: "X",
            list: [
              ["3600000", "2", "3", "1", "2", "7", "900"],
              ["900000", "2", "3", "1", "2", "7", "900"],
            ],
          },
        }),
      ),
    );
    const c = await new BybitClient(
      new AbortController().signal,
      fetcher,
      0,
    ).candles("X", "15", 3600001);
    expect(c.map((x) => x.time)).toEqual([900000]);
  });
});
describe("indicator reference calculations", () => {
  it("seeds EMA with SMA then uses alpha 2/(period+1)", () => {
    expect(ema([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });
  it("Wilder DMI and ADX match analytical linear trend", () => {
    const c = bars();
    const a = dmi(c);
    expect(a.plus[13]).toBeNull();
    expect(a.plus[14]).toBeCloseTo(25, 10);
    expect(a.minus[14]).toBe(0);
    expect(a.adx[26]).toBeNull();
    expect(a.adx[27]).toBeCloseTo(100);
    const mirrored = c.map((x) => ({
      ...x,
      high: 1000 - x.low,
      low: 1000 - x.high,
      open: 1000 - x.open,
      close: 1000 - x.close,
    }));
    expect(dmi(mirrored).minus[14]).toBeCloseTo(25);
  });
  it("Slow Stochastic (14,3,3) matches rolling range then two SMAs", () => {
    const a = stochastic(bars());
    expect(a.k[14]).toBeNull();
    expect(a.k[15]).toBeCloseTo((100 * 16) / 17);
    expect(a.d[16]).toBeNull();
    expect(a.d[17]).toBeCloseTo((100 * 16) / 17);
    const flat = bars().map((x) => ({
      ...x,
      open: 1,
      high: 1,
      low: 1,
      close: 1,
    }));
    expect(stochastic(flat).d.at(-1)).toBe(50);
  });
  it("CO uses volume, independently calculated cumulative AD and EMA seeds", () => {
    const c = bars();
    const a = chaikin(c);
    expect(a.ad.slice(0, 3)).toEqual([5, 10, 15]);
    expect(a.co[8]).toBeNull();
    expect(a.co[9]).toBeCloseTo(17.5, 10);
    expect(a.co[100]).toBeCloseTo(17.5, 8);
    expect(chaikin(c.map((x) => ({ ...x, turnover: 1 }))).co).toEqual(a.co);
    expect(
      chaikin(c.map((x) => ({ ...x, high: x.close, low: x.close }))).co.at(-1),
    ).toBe(0);
  });
  it("MACD histogram matches analytical arithmetic progression and constant series", () => {
    const a = macd(Array.from({ length: 100 }, (_, i) => i + 1));
    expect(a.macd[25]).toBeCloseTo(7);
    expect(a.signal[32]).toBeNull();
    expect(a.signal[33]).toBeCloseTo(7);
    expect(a.histogram[33]).toBeCloseTo(0, 12);
    expect(macd(Array(100).fill(42)).histogram.at(-1)).toBe(0);
  });
});
describe("directional events and causal score", () => {
  it("requires actual crossing with inclusive previous equality", () => {
    expect(crosses([-1, 0, 2, 3, -1], [0, 0, 0, 0, 0])).toEqual([
      { index: 2, direction: "LONG" },
      { index: 4, direction: "SHORT" },
    ]);
    expect(crosses([-4, -3, -2], [0, 0, 0])).toEqual([]);
  });
  it("stochastic qualifier checks either adjacent K extreme", () => {
    expect(
      crosses(
        [19, 22],
        [20, 21],
        (i) => Math.min([19, 22][i - 1], [19, 22][i]) <= 20,
      ),
    ).toEqual([{ index: 1, direction: "LONG" }]);
    expect(
      crosses(
        [81, 78],
        [80, 79],
        (i) => Math.max([81, 78][i - 1], [81, 78][i]) >= 80,
      )[0].direction,
    ).toBe("SHORT");
  });
  it("expires exactly after 10 bars and reversals immediately cancel prior direction", () => {
    const e = events(),
      c = bars();
    e.DMI = [
      { index: 300, direction: "LONG" },
      { index: 312, direction: "SHORT" },
    ];
    expect(scoreAt(e, c, 309, 10, "LONG").score).toBe(1);
    expect(scoreAt(e, c, 310, 10, "LONG").score).toBe(0);
    expect(scoreAt(e, c, 312, 20, "LONG").score).toBe(0);
    expect(scoreAt(e, c, 312, 20, "SHORT").score).toBe(1);
    expect(scoreAt(e, c, 299, 20, "SHORT").score).toBe(0);
  });
  it("counts max one point per indicator and allows independent directions", () => {
    const e = events(),
      c = bars();
    e.DMI = [
      { index: 320, direction: "LONG" },
      { index: 321, direction: "LONG" },
    ];
    e.CO = [{ index: 322, direction: "SHORT" }];
    expect(scoreAt(e, c, 323, 10, "LONG").score).toBe(1);
    expect(scoreAt(e, c, 323, 10, "SHORT").score).toBe(1);
  });
  it("rejects insufficient warmup and history never consumes future events", () => {
    expect(() => analyze("X", "", bars(299), DEFAULT_SETTINGS)).toThrow("부족");
    const c = bars(),
      a = analyze("X", "", c, DEFAULT_SETTINGS);
    for (const h of a.history) {
      const prefix = analyze(
        "X",
        "",
        c.filter((x) => x.time <= h.time),
        DEFAULT_SETTINGS,
      );
      expect(prefix.directions.LONG.score).toBe(h.LONG);
      expect(prefix.directions.SHORT.score).toBe(h.SHORT);
    }
  });
});
describe("whole universe scanner", () => {
  const instrument = (symbol: string, symbolType = "") => ({
    symbol,
    symbolType,
    contractType: "LinearPerpetual",
    quoteCoin: "USDT",
    settleCoin: "USDT",
    status: "Trading",
  });
  function client(n = 94) {
    return {
      serverTime: vi.fn().mockResolvedValue(999999999),
      instruments: vi
        .fn()
        .mockResolvedValue(
          Array.from({ length: n }, (_, i) => instrument(`S${i}`)),
        ),
      tickers: vi
        .fn()
        .mockResolvedValue(
          Array.from({ length: n }, (_, i) => ({
            symbol: `S${i}`,
            turnover24h: "10000000",
            lastPrice: "1",
          })),
        ),
      candles: vi.fn().mockImplementation(async () => bars()),
    };
  }
  it("evaluates all 94; TOP 5 is local and obeys minimum", async () => {
    const c = client(),
      s = await scan(
        DEFAULT_SETTINGS,
        new AbortController().signal,
        () => {},
        c,
      );
    expect(s.done).toBe(94);
    expect(c.candles).toHaveBeenCalledTimes(94);
    selectResults(s.results, "ALL", 3, "top5");
    expect(c.candles).toHaveBeenCalledTimes(94);
    expect(
      selectResults(s.results, "ALL", 3, "top5").every((r) => r.score >= 3),
    ).toBe(true);
    expect(selectResults(s.results, "ALL", 3, "all")).toHaveLength(188);
  });
  it("filters market and turnover BEFORE candles", async () => {
    const c = client(4);
    c.instruments.mockResolvedValue([
      instrument("S0"),
      instrument("S1", "stock"),
      instrument("S2", "stock"),
      instrument("S3", "ETF"),
    ]);
    c.tickers.mockResolvedValue([
      { symbol: "S0", turnover24h: "10000000", lastPrice: "1" },
      { symbol: "S1", turnover24h: "10000000", lastPrice: "1" },
      { symbol: "S2", turnover24h: "9999999", lastPrice: "1" },
      { symbol: "S3", turnover24h: "10000000", lastPrice: "1" },
    ]);
    const s = await scan(
      { ...DEFAULT_SETTINGS, market: "stock" },
      new AbortController().signal,
      () => {},
      c,
    );
    expect(s.total).toBe(1);
    expect(c.candles.mock.calls[0][0]).toBe("S1");
  });
  it("keeps failures separate from successful zero scores and reports partial progress", async () => {
    const c = client(3);
    c.candles.mockRejectedValueOnce(new Error("fixture API failure"));
    const progress: number[] = [];
    const s = await scan(
      DEFAULT_SETTINGS,
      new AbortController().signal,
      (s) => progress.push(s.done),
      c,
    );
    expect(s.results).toHaveLength(2);
    expect(s.failures).toEqual([
      { symbol: "S0", reason: "fixture API failure" },
    ]);
    expect(s.done).toBe(3);
    expect(progress).toContain(1);
  });
  it("list failure fails whole scan without candle requests", async () => {
    const c = client();
    c.instruments.mockRejectedValue(new Error("list failure"));
    await expect(
      scan(DEFAULT_SETTINGS, new AbortController().signal, () => {}, c),
    ).rejects.toThrow("list failure");
    expect(c.candles).not.toHaveBeenCalled();
  });
  it("caps concurrency at four and cancellation preserves completed data", async () => {
    const c = client(20),
      controller = new AbortController();
    let active = 0,
      max = 0;
    c.candles.mockImplementation(async () => {
      active++;
      max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, 1));
      active--;
      return bars();
    });
    const s = await scan(
      DEFAULT_SETTINGS,
      controller.signal,
      (s) => {
        if (s.done >= 2) controller.abort();
      },
      c,
    );
    expect(max).toBeLessThanOrEqual(4);
    expect(s.status).toBe("cancelled");
    expect(s.results).toHaveLength(2);
    expect(s.done).toBe(2);
  });
  it("sorts by score, signal recency, symbol; limits after evaluating", () => {
    const a = analyze("Z", "", bars(), DEFAULT_SETTINGS),
      b = analyze("A", "", bars(), DEFAULT_SETTINGS);
    a.directions.LONG.score = b.directions.LONG.score = 3;
    a.directions.LONG.lastTime = 10;
    b.directions.LONG.lastTime = 20;
    expect(
      selectResults([a, b], "LONG", 3, "top5").map((r) => r.analysis.symbol),
    ).toEqual(["A", "Z"]);
    expect(selectResults([a, b], "LONG", 4, "top5")).toHaveLength(0);
    expect(selectResults([a, b], "ALL", 2, "four")).toHaveLength(0);
  });
});
