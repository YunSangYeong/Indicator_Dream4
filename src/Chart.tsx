import { useState } from "react";
import { ema } from "./indicators/common";
import type { Analysis } from "./types";
import { NAMES } from "./types";
import { number, time } from "./format";
export function Chart({
  analysis: a,
  interval,
}: {
  analysis: Analysis;
  interval: string;
}) {
  const [selected, setSelected] = useState(a.candles.length - 1);
  const c = a.candles;
  const first = Math.max(0, c.length - 80);
  const shown = c.slice(first);
  const fast = ema(
      c.map((x) => x.close),
      50,
    ),
    slow = ema(
      c.map((x) => x.close),
      200,
    );
  const prices = shown.flatMap((v, i) => [
    v.low,
    v.high,
    fast[first + i]!,
    slow[first + i]!,
  ]);
  const lo = Math.min(...prices),
    hi = Math.max(...prices),
    range = hi - lo || 1;
  const y = (v: number) => 220 - ((v - lo) / range) * 180;
  const x = (i: number) => 35 + (i - first) * 9;
  const v = c[selected];
  const path = (series: (number | null)[]) =>
    series
      .slice(first)
      .map((v, i) =>
        v === null ? "" : `${i ? "L" : "M"}${x(first + i)},${y(v)}`,
      )
      .join(" ");
  return (
    <section className="chart-block">
      <p className="muted">
        확정 {interval}분봉 · EMA50 주황 / EMA200 보라 · ▲ LONG / ▼ SHORT
      </p>
      <div className="chart-scroll">
        <svg
          viewBox="0 0 780 265"
          role="img"
          aria-label="확정봉 캔들 차트와 BIG 4 신호"
        >
          <text x="2" y="15" fill="#9facbf">
            {number(hi)}
          </text>
          {shown.map((bar, i) => {
            const index = first + i,
              color = bar.close >= bar.open ? "#44d7ad" : "#ff7e91";
            return (
              <g key={bar.time} onClick={() => setSelected(index)}>
                <line
                  x1={x(index)}
                  x2={x(index)}
                  y1={y(bar.high)}
                  y2={y(bar.low)}
                  stroke={color}
                />
                <rect
                  x={x(index) - 2.8}
                  width="5.6"
                  y={y(Math.max(bar.open, bar.close))}
                  height={Math.max(1, Math.abs(y(bar.open) - y(bar.close)))}
                  fill={color}
                />
                <rect
                  x={x(index) - 4.5}
                  width="9"
                  y="25"
                  height="220"
                  fill="transparent"
                />
              </g>
            );
          })}
          <path
            d={path(fast)}
            fill="none"
            stroke="#ffae67"
            strokeWidth="2"
            aria-label="EMA50"
          />
          <path
            d={path(slow)}
            fill="none"
            stroke="#b6a2ff"
            strokeWidth="4"
            aria-label="EMA200"
          />
          {NAMES.flatMap((name, n) =>
            a.events[name]
              .filter((e) => e.index >= first)
              .map((e) => (
                <text
                  key={`${name}${e.index}`}
                  x={x(e.index)}
                  y={e.direction === "LONG" ? 240 + n * 6 : 25 + n * 7}
                  fill={e.direction === "LONG" ? "#44d7ad" : "#ff7e91"}
                  fontSize="8"
                >
                  <title>
                    {name} {e.direction} {time(c[e.index].time)}
                  </title>
                  {e.direction === "LONG" ? "▲" : "▼"}
                </text>
              )),
          )}
          <line
            x1={x(selected)}
            x2={x(selected)}
            y1="20"
            y2="240"
            stroke="#ffffff55"
            strokeDasharray="3 3"
          />
        </svg>
      </div>
      <div className="inspector">
        <button
          disabled={selected <= first}
          onClick={() => setSelected(selected - 1)}
          aria-label="이전 캔들"
        >
          ←
        </button>
        <span>
          {time(v.time + Number(interval) * 60000)} 확정 · KST
          <br />시 {number(v.open)} 고 {number(v.high)} 저 {number(v.low)} 종{" "}
          {number(v.close)}
          <br />
          거래량 {number(v.volume)} · EMA50 {number(fast[selected])} / EMA200{" "}
          {number(slow[selected])}
        </span>
        <button
          disabled={selected === c.length - 1}
          onClick={() => setSelected(selected + 1)}
          aria-label="다음 캔들"
        >
          →
        </button>
      </div>
    </section>
  );
}
