import { useCallback, useEffect, useRef, useState } from "react";
import { scan } from "./scanner";
import { selectResults, type ViewMode } from "./scoring";
import {
  DEFAULT_SETTINGS,
  NAMES,
  type Analysis,
  type Direction,
  type Settings,
  type Snapshot,
} from "./types";
import { MARKET_LABELS, type MarketFilter } from "./market";
import { marketLabel, number, time } from "./format";
import { errorMessage } from "./api";
import { Chart } from "./Chart";
const descriptions = {
  DMI: "Wilder 14 평활화. +DI / −DI 교차에 1점. ADX는 참고값입니다.",
  STOCH:
    "Slow (14, 3, 3). K/D 교차 직전 또는 현재 K가 과매도·과매수 영역에 있어야 합니다.",
  CO: "실제 거래량 기반 A/D의 EMA3 − EMA10. 0선 교차에 1점. 다이버전스는 제외합니다.",
  MACD: "EMA12 − EMA26, Signal EMA9. 히스토그램 0선 교차에만 1점.",
};
function Detail({
  a,
  d,
  settings,
  close,
}: {
  a: Analysis;
  d: Direction;
  settings: Settings;
  close: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const current = a.directions[d];
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const els = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],summary,[tabindex="0"]',
        );
        if (!els?.length) return;
        const first = els[0],
          last = els[els.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, [close]);
  return (
    <div className="backdrop" onClick={close}>
      <div
        className="detail"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={`${a.symbol} 상세`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <div>
            <span className={`badge ${d}`}>{d}</span>
            <h2>{a.symbol}</h2>
            <p>
              {marketLabel(a.symbolType)} · {settings.interval}분봉
            </p>
          </div>
          <button onClick={close} aria-label="상세 닫기">
            닫기 ×
          </button>
        </header>
        <div className="metrics">
          <div>
            <small>최신 유효 점수</small>
            <strong>{current.score} / 4</strong>
          </div>
          <div>
            <small>최근 {settings.window}봉 최고 발생 점수</small>
            <strong>{Math.max(...a.history.map((h) => h[d]))} / 4</strong>
          </div>
        </div>
        <Chart analysis={a} interval={settings.interval} />
        <h3>BIG 4 상태 · 최신 확정봉 기준</h3>
        {NAMES.map((name) => {
          const vote = current.votes[name];
          return (
            <details key={name}>
              <summary>
                {name}{" "}
                <b>
                  {vote.point}점 · {vote.point ? "유효" : "무효"}
                </b>
              </summary>
              <p>{descriptions[name]}</p>
              <p>
                최근 신호: {vote.lastDirection ?? "없음"} ·{" "}
                {time(
                  vote.time === null
                    ? null
                    : vote.time + Number(settings.interval) * 60000,
                )}{" "}
                KST · {vote.age ?? "—"}봉 전
              </p>
              <p>
                {name === "DMI"
                  ? `+DI ${number(a.values.plus)} / −DI ${number(a.values.minus)} / ADX ${number(a.values.adx)}`
                  : name === "STOCH"
                    ? `K ${number(a.values.k)} / D ${number(a.values.d)}`
                    : name === "CO"
                      ? `CO ${number(a.values.co)}`
                      : `MACD ${number(a.values.macd)} / Signal ${number(a.values.signal)} / Histogram ${number(a.values.histogram)}`}
              </p>
            </details>
          );
        })}
        <h3>발생 점수 이력 · 미래 정보 미사용</h3>
        <p className="muted">
          최근 {settings.window}개 확정봉. 신호 시각은 캔들 종료 시각입니다.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>확정 시각 (KST)</th>
                <th>LONG</th>
                <th>SHORT</th>
              </tr>
            </thead>
            <tbody>
              {a.history.toReversed().map((h) => (
                <tr key={h.time}>
                  <td>{time(h.time + Number(settings.interval) * 60000)}</td>
                  <td>{h.LONG}</td>
                  <td>{h.SHORT}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="notice">
          TradingView 직접 연결 미확인 · {marketLabel(a.symbolType)} 무기한
          선물의 정확한 심볼 지원 여부를 확인할 수 없어 다른 종목으로 연결하지
          않습니다.
        </p>
        <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
          TradingView 열기 (종목 직접 검색)
        </a>
      </div>
    </div>
  );
}
export default function App() {
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS }),
    [direction, setDirection] = useState<Direction | "ALL">("ALL"),
    [minimum, setMinimum] = useState(3),
    [mode, setMode] = useState<ViewMode>("threshold");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<{ a: Analysis; d: Direction } | null>(
      null,
    );
  const control = useRef<AbortController | null>(null);
  const closeDetail = useCallback(() => setSelected(null), []);
  useEffect(() => () => control.current?.abort(), []);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));
  const valid =
    Number.isFinite(settings.minTurnover) &&
    settings.minTurnover >= 0 &&
    settings.oversold >= 0 &&
    settings.overbought <= 100 &&
    settings.oversold < settings.overbought;
  async function start() {
    if (busy || !valid) return;
    const c = new AbortController();
    control.current = c;
    setBusy(true);
    setError("");
    setSnapshot(null);
    setSelected(null);
    try {
      await scan(settings, c.signal, setSnapshot);
    } catch (e) {
      setError(
        c.signal.aborted
          ? "검색이 취소되었습니다."
          : `전체 검색 실패: ${errorMessage(e)}`,
      );
    } finally {
      setBusy(false);
    }
  }
  const rows = selectResults(snapshot?.results ?? [], direction, minimum, mode),
    changed =
      snapshot &&
      JSON.stringify(settings) !== JSON.stringify(snapshot.settings),
    found =
      snapshot?.results.filter(
        (a) => a.directions.LONG.score >= 3 || a.directions.SHORT.score >= 3,
      ).length ?? 0;
  return (
    <>
      <main>
        <header className="hero">
          <div className="eyebrow">SHARPSHOOTER · RESEARCH TOOL</div>
          <h1>
            BIG <em>4</em> 스캐너<span>V1.0</span>
          </h1>
          <p>
            네 가지 신호, 하나의 탐색.
            <br />
            Bybit USDT 무기한 선물의 전환 후보를 살펴보세요.
          </p>
          <div className="hero-tags">
            <span>확정봉 전용</span>
            <span>수동 검색</span>
            <span>LONG + SHORT</span>
          </div>
        </header>
        <section className="panel" aria-label="검색 조건">
          <div className="section-heading">
            <h2>검색 조건</h2>
            <span>KST · 한국시간</span>
          </div>
          <fieldset disabled={busy}>
            <div className="form-grid">
              <label>
                검색 대상
                <select
                  aria-label="검색 대상"
                  value={settings.market}
                  onChange={(e) =>
                    set("market", e.target.value as MarketFilter)
                  }
                >
                  {Object.entries(MARKET_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                시간봉
                <select
                  aria-label="시간봉"
                  value={settings.interval}
                  onChange={(e) => set("interval", e.target.value)}
                >
                  {["5", "15", "30", "60", "240"].map((v) => (
                    <option key={v} value={v}>
                      {v}분봉
                    </option>
                  ))}
                </select>
              </label>
              <label>
                신호 유효기간
                <select
                  aria-label="신호 유효기간"
                  value={settings.window}
                  onChange={(e) => set("window", Number(e.target.value))}
                >
                  {[5, 10, 20].map((v) => (
                    <option key={v} value={v}>
                      최근 {v}봉
                    </option>
                  ))}
                </select>
              </label>
              <label>
                최소 24h 거래대금 (만 USDT)
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={settings.minTurnover / 10000}
                  onChange={(e) =>
                    set(
                      "minTurnover",
                      e.target.value === ""
                        ? NaN
                        : Number(e.target.value) * 10000,
                    )
                  }
                />
              </label>
            </div>
            <details className="advanced">
              <summary>스토캐스틱 기준 조정</summary>
              <div className="form-grid">
                <label>
                  과매도 기준
                  <input
                    type="number"
                    min="0"
                    max="99"
                    value={settings.oversold}
                    onChange={(e) =>
                      set(
                        "oversold",
                        e.target.value === "" ? NaN : Number(e.target.value),
                      )
                    }
                  />
                </label>
                <label>
                  과매수 기준
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={settings.overbought}
                    onChange={(e) =>
                      set(
                        "overbought",
                        e.target.value === "" ? NaN : Number(e.target.value),
                      )
                    }
                  />
                </label>
              </div>
            </details>
          </fieldset>
          <p className="muted">
            주식만: Bybit 개별 주식 기반 무기한 선물. 현물 주식 전체 검색이
            아닙니다.
          </p>
          {!valid && (
            <p role="alert">
              입력 범위를 확인하세요. 0 ≤ 과매도 &lt; 과매수 ≤ 100, 거래대금 ≥
              0.
            </p>
          )}
          <div className="actions">
            <button
              className="primary"
              onClick={start}
              disabled={busy || !valid}
            >
              {busy ? "분석 중…" : "검색 시작"}
            </button>
            {busy && (
              <button onClick={() => control.current?.abort()}>
                검색 취소
              </button>
            )}
          </div>
        </section>
        {changed && (
          <p className="notice">
            검색 조건이 변경되었습니다. 검색 시작을 눌러 새 조건을 적용하세요.
            아래는 이전 검색 결과입니다.
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {snapshot && (
          <section className="panel progress" aria-live="polite">
            <div className="section-heading">
              <h2>
                {snapshot.status === "running"
                  ? "검색 진행 중 · 부분 결과"
                  : snapshot.status === "cancelled"
                    ? "검색 취소 · 부분 결과"
                    : "전체 대상 평가 완료"}
              </h2>
              <b>
                {snapshot.total
                  ? Math.round((snapshot.done / snapshot.total) * 100)
                  : 100}
                %
              </b>
            </div>
            <progress value={snapshot.done} max={snapshot.total || 1} />
            <p>
              {snapshot.done} / {snapshot.total}종목 분석 완료
            </p>
            <div className="stats">
              <span>
                남음 <b>{snapshot.total - snapshot.done}</b>
              </span>
              <span>
                실패 <b>{snapshot.failures.length}</b>
              </span>
              <span>
                3점 이상 <b>{found}</b>
              </span>
            </div>
            <p className="muted">
              기준 {time(snapshot.marketTime)} KST ·{" "}
              {MARKET_LABELS[snapshot.settings.market]} ·{" "}
              {snapshot.settings.interval}분봉 · 최근 {snapshot.settings.window}
              봉
            </p>
            {snapshot.failures.length > 0 && (
              <details className="failures">
                <summary>
                  부분 실패 {snapshot.failures.length}종목 · 원인 보기
                </summary>
                {snapshot.failures.map((f) => (
                  <p key={f.symbol}>
                    {f.symbol}: {f.reason}
                  </p>
                ))}
              </details>
            )}
          </section>
        )}
        <section className="results">
          <div className="section-heading">
            <h2>
              검색 결과 <span>{rows.length}</span>
            </h2>
            <span>현재 유효 점수순</span>
          </div>
          <div className="filters">
            <label>
              검색 방향
              <select
                aria-label="검색 방향"
                value={direction}
                onChange={(e) =>
                  setDirection(e.target.value as Direction | "ALL")
                }
              >
                {["ALL", "LONG", "SHORT"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              최소 점수
              <select
                aria-label="최소 점수"
                value={minimum}
                onChange={(e) => setMinimum(Number(e.target.value))}
              >
                {[2, 3, 4].map((v) => (
                  <option key={v} value={v}>
                    {v}점 이상
                  </option>
                ))}
              </select>
            </label>
            <label>
              표시 모드
              <select
                aria-label="표시 모드"
                value={mode}
                onChange={(e) => setMode(e.target.value as ViewMode)}
              >
                <option value="threshold">최소 점수 이상</option>
                <option value="four">4점만</option>
                <option value="top5">TOP 5</option>
                <option value="all">전체 점수 보기</option>
              </select>
            </label>
          </div>
          <p className="muted">
            필터는 저장된 계산 결과에 즉시 적용됩니다. 전체 점수 보기는 최소
            점수를 적용하지 않습니다.
          </p>
          {rows.length === 0 && (
            <div className="empty">
              <span>＋</span>
              <h3>
                {snapshot
                  ? "표시 조건에 맞는 결과가 없습니다"
                  : "시장을 탐색할 준비가 되었습니다"}
              </h3>
              <p>
                {snapshot
                  ? "점수·방향 필터와 실패 원인을 확인하세요."
                  : "검색 시작을 누르면 필터를 통과한 모든 종목을 분석합니다."}
              </p>
            </div>
          )}
          <div className="card-grid">
            {rows.map((r) => (
              <article
                className={`result-card ${r.direction}`}
                key={r.analysis.symbol + r.direction}
              >
                <div className="card-head">
                  <div>
                    <h3>{r.analysis.symbol}</h3>
                    <span>{marketLabel(r.analysis.symbolType)}</span>
                  </div>
                  <span className={`badge ${r.direction}`}>{r.direction}</span>
                </div>
                <div className="score">
                  <strong>
                    {r.score}
                    <small>/ 4</small>
                  </strong>
                  <span>현재 BIG 4 점수</span>
                </div>
                <div className="votes">
                  {NAMES.map((n) => (
                    <span key={n} className={r.votes[n].point ? "active" : ""}>
                      {n}
                      <b>{r.votes[n].point}</b>
                    </span>
                  ))}
                </div>
                <p className="muted">
                  마지막 유효 신호{" "}
                  {time(
                    r.lastTime === null
                      ? null
                      : r.lastTime +
                          Number(snapshot!.settings.interval) * 60000,
                  )}{" "}
                  KST · {r.age === null ? "—" : `${r.age}봉 전`}
                </p>
                <div className="card-actions">
                  <button
                    onClick={() =>
                      setSelected({ a: r.analysis, d: r.direction })
                    }
                  >
                    차트 · 지표 상세 ↗
                  </button>
                  <span className="muted">TradingView 연결 미확인</span>
                </div>
              </article>
            ))}
          </div>
        </section>
        <footer>
          <p>
            본 프로젝트의 4점 점수제는 연구용 규칙이며 박문환의 공식 매매법이
            아닙니다.
          </p>
          <p>
            매매 후보 탐색 도구 · 자동매매 및 수익률 예측 기능 없음 · API/지역
            제한 시 조회가 실패할 수 있습니다.
          </p>
        </footer>
      </main>
      {selected && snapshot && (
        <Detail
          a={selected.a}
          d={selected.d}
          settings={snapshot.settings}
          close={closeDetail}
        />
      )}
    </>
  );
}
