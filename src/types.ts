import type { MarketFilter } from "./market";
export const INTERVAL = 900_000;
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
}
export type Direction = "LONG" | "SHORT";
export type IndicatorName = "DMI" | "STOCH" | "CO" | "MACD";
export const NAMES: IndicatorName[] = ["DMI", "STOCH", "CO", "MACD"];
export interface Settings {
  market: MarketFilter;
  interval: string;
  window: number;
  minTurnover: number;
  oversold: number;
  overbought: number;
}
export const DEFAULT_SETTINGS: Settings = {
  market: "crypto",
  interval: "15",
  window: 10,
  minTurnover: 10_000_000,
  oversold: 20,
  overbought: 80,
};
export interface Event {
  index: number;
  direction: Direction;
}
export interface Vote {
  point: 0 | 1;
  time: number | null;
  age: number | null;
  lastDirection: Direction | null;
}
export interface Score {
  score: number;
  votes: Record<IndicatorName, Vote>;
  lastTime: number | null;
  age: number | null;
}
export interface Values {
  plus: number | null;
  minus: number | null;
  adx: number | null;
  k: number | null;
  d: number | null;
  co: number | null;
  macd: number | null;
  signal: number | null;
  histogram: number | null;
}
export interface Analysis {
  symbol: string;
  symbolType?: string;
  candles: Candle[];
  values: Values;
  events: Record<IndicatorName, Event[]>;
  directions: Record<Direction, Score>;
  history: { time: number; LONG: number; SHORT: number }[];
}
export interface Failure {
  symbol: string;
  reason: string;
}
export interface Snapshot {
  results: Analysis[];
  failures: Failure[];
  total: number;
  done: number;
  marketTime: number;
  settings: Settings;
  status: "running" | "complete" | "cancelled";
}
