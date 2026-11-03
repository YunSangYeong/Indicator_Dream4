import { afterEach, describe, it, expect, vi } from "vitest";
import { BybitClient } from "./api";
import { dmi } from "./indicators/dmi";
import { chaikin } from "./indicators/chaikin";
import { macd } from "./indicators/macd";
import { analyze } from "./scoring";
import { DEFAULT_SETTINGS, type Candle } from "./types";
afterEach(() => vi.useRealTimers());
const envelope = (result: unknown) =>
  new Response(JSON.stringify({ retCode: 0, result, time: 1800000000000 }));
describe("nonconstant reference values and defensive queue", () => {
  it("Wilder recurrence differs from a rolling SMA on alternating ranges", () => {
    const c = [
      [11, 9, 10],
      [13, 10, 12],
      [12, 8, 9],
      [14, 9, 13],
      [13, 7, 8],
    ].map(([high, low, close], i) => ({
      time: i * 900000,
      high,
      low,
      close,
      open: close,
      volume: 10,
      turnover: 100,
    }));
    const a = dmi(c, 2);
    expect(a.plus[2]).toBeCloseTo(100 / 3.5);
    expect(a.minus[2]).toBeCloseTo(100 / 3.5);
    expect(a.plus[3]).toBeCloseTo(150 / 4.25);
    expect(a.minus[3]).toBeCloseTo(50 / 4.25);
    expect(a.adx[3]).toBeCloseTo(25);
    expect(a.plus[4]).toBeCloseTo(75 / 5.125);
    expect(a.minus[4]).toBeCloseTo(125 / 5.125);
    expect(a.adx[4]).toBeCloseTo(25);
  });
  it("CO matches independent non-linear EMA values after a single AD impulse", () => {
    const c = Array.from({ length: 20 }, (_, i) => ({
      time: i * 900000,
      open: 1,
      high: 2,
      low: 0,
      close: i === 10 ? 2 : 1,
      volume: i === 10 ? 100 : 1,
      turnover: 1,
    }));
    const co = chaikin(c).co;
    expect(co[9]).toBe(0);
    expect(co[10]).toBeCloseTo(31.818181818181817);
    expect(co[11]).toBeCloseTo(41.94214876033058);
  });
  it("MACD responds to a step with exact independent EMA coefficients", () => {
    const c = Array(40).fill(100).concat([110]);
    const a = macd(c);
    const delta = 10 * (2 / 13 - 2 / 27);
    expect(a.macd[40]).toBeCloseTo(delta);
    expect(a.signal[40]).toBeCloseTo(delta * 0.2);
    expect(a.histogram[40]).toBeCloseTo(delta * 0.8);
  });
  it("produces both LONG and SHORT events from the same oscillating OHLCV", () => {
    const c: Candle[] = Array.from({ length: 400 }, (_, i) => {
      const close = 100 + Math.sin(i / 5) * 10;
      return {
        time: i * 900000,
        open: close - 0.2,
        high: close + 1,
        low: close - 1,
        close,
        volume: 100 + (i % 7),
        turnover: 999999,
      };
    });
    const a = analyze("FIXTURE", "", c, DEFAULT_SETTINGS);
    for (const name of ["DMI", "STOCH", "MACD"] as const) {
      expect(a.events[name].some((e) => e.direction === "LONG")).toBe(true);
      expect(a.events[name].some((e) => e.direction === "SHORT")).toBe(true);
    }
  });
  it("spaces parallel attempts >=200ms and applies Retry-After to queued slots", async () => {
    vi.useFakeTimers();
    const times: number[] = [];
    let count = 0;
    const fetcher = vi.fn().mockImplementation(async () => {
      times.push(Date.now());
      return count++ === 0
        ? new Response("", { status: 429, headers: { "Retry-After": "2" } })
        : envelope({ timeSecond: "1800000000" });
    });
    const client = new BybitClient(new AbortController().signal, fetcher, 200);
    const pending = Promise.all([
      client.serverTime(),
      client.serverTime(),
      client.serverTime(),
    ]);
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    await pending;
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(2000);
    for (let i = 1; i < times.length; i++)
      expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(200);
  });
  it("caps transient failures at exactly three attempts", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 503 }));
    const pending = new BybitClient(
      new AbortController().signal,
      fetcher,
      0,
    ).serverTime();
    const assertion = expect(pending).rejects.toThrow("503");
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("times out at 12 seconds and retries without hanging", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("timeout", "AbortError")),
          );
        }),
    );
    const pending = new BybitClient(
      new AbortController().signal,
      fetcher,
      0,
    ).serverTime();
    const assertion = expect(pending).rejects.toThrow("12초");
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
