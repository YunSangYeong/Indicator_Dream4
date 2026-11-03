import { BybitClient, errorMessage } from "./api";
import { matchesMarket } from "./market";
import { analyze } from "./scoring";
import type { Settings, Snapshot } from "./types";
export type ScanClient = Pick<
  BybitClient,
  "serverTime" | "instruments" | "tickers" | "candles"
>;
export async function scan(
  settings: Settings,
  signal: AbortSignal,
  update: (s: Snapshot) => void,
  client: ScanClient = new BybitClient(signal),
): Promise<Snapshot> {
  const marketTime = await client.serverTime(),
    instruments = await client.instruments(),
    tickers = await client.tickers();
  const turnover = new Map(
    tickers.map((t) => [t.symbol, Number(t.turnover24h)]),
  );
  const eligible = instruments.filter(
    (i) =>
      matchesMarket(i.symbolType, settings.market) &&
      Number.isFinite(turnover.get(i.symbol)) &&
      turnover.get(i.symbol)! >= settings.minTurnover,
  );
  const snapshot: Snapshot = {
    results: [],
    failures: [],
    total: eligible.length,
    done: 0,
    marketTime,
    settings: { ...settings },
    status: "running",
  };
  let cursor = 0;
  const emit = () =>
    update({
      ...snapshot,
      results: [...snapshot.results],
      failures: [...snapshot.failures],
    });
  emit();
  await Promise.all(
    Array.from({ length: Math.min(4, eligible.length) }, async () => {
      while (!signal.aborted) {
        const item = eligible[cursor++];
        if (!item) return;
        try {
          const candles = await client.candles(
            item.symbol,
            settings.interval,
            marketTime,
          );
          if (signal.aborted) return;
          snapshot.results.push(
            analyze(item.symbol, item.symbolType, candles, settings),
          );
        } catch (e) {
          if (signal.aborted) return;
          snapshot.failures.push({
            symbol: item.symbol,
            reason: errorMessage(e),
          });
        }
        snapshot.done++;
        emit();
      }
    }),
  );
  snapshot.status = signal.aborted ? "cancelled" : "complete";
  emit();
  return snapshot;
}
