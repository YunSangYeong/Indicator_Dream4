import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
// Isolated synthetic API fixtures; never included in the application bundle.
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
  headless: true,
  args: ["--no-sandbox"],
});
const base =
  process.env.TEST_BASE_URL || "http://127.0.0.1:4173/Indicator_Dream4/";
const now = Math.floor(Date.now() / 900000) * 900000;
const envelope = (result) => ({ retCode: 0, retMsg: "OK", time: now, result });
const instruments = [
  ["BTCUSDT", ""],
  ["STOCKUSDT", "stock"],
  ["UNKNOWNUSDT", undefined],
  ["LOWUSDT", ""],
].map(([symbol, symbolType]) => ({
  symbol,
  symbolType,
  quoteCoin: "USDT",
  settleCoin: "USDT",
  contractType: "LinearPerpetual",
  status: "Trading",
}));
const rows = Array.from({ length: 340 }, (_, i) => {
  const close = 100 + Math.sin(i / 5) * 8;
  return [
    String(now - (340 - i) * 900000),
    String(close - 0.3),
    String(close + 1),
    String(close - 1),
    String(close),
    "100",
    "10000",
  ];
});
rows.push([
  String(now),
  "100",
  "1000000",
  "99",
  "1000000",
  "100000",
  "100000000",
]);
let calls = 0,
  failStock = false,
  failList = false,
  slow = false;
const errors = [];
const page = await browser.newPage({
  viewport: { width: 375, height: 812 },
  isMobile: true,
  hasTouch: true,
});
page.on("pageerror", (e) => errors.push(e.message));
await page.route("https://api.bybit.com/**", async (route) => {
  const u = new URL(route.request().url());
  let response;
  if (u.pathname.endsWith("/time"))
    response = envelope({ timeSecond: String(now / 1000) });
  if (u.pathname.endsWith("/instruments-info")) {
    if (failList) {
      await route.fulfill({ status: 403, body: "fixture denied" });
      return;
    }
    response = envelope({ list: instruments, nextPageCursor: "" });
  }
  if (u.pathname.endsWith("/tickers"))
    response = envelope({
      list: instruments.map((i) => ({
        symbol: i.symbol,
        turnover24h: i.symbol === "LOWUSDT" ? "9999999" : "20000000",
        lastPrice: "100",
      })),
    });
  if (u.pathname.endsWith("/kline")) {
    calls++;
    assert.notEqual(u.searchParams.get("symbol"), "LOWUSDT");
    assert.equal(u.searchParams.get("interval"), "15");
    assert.equal(u.searchParams.get("limit"), "1000");
    if (slow) await new Promise((r) => setTimeout(r, 1500));
    response =
      failStock && u.searchParams.get("symbol") === "STOCKUSDT"
        ? {
            retCode: 10001,
            retMsg: "fixture individual failure",
            result: {},
            time: now,
          }
        : envelope({
            symbol: u.searchParams.get("symbol"),
            list: rows.toReversed(),
          });
  }
  try {
    await route.fulfill({ status: 200, json: response });
  } catch (e) {
    if (!String(e).includes("closed")) throw e;
  }
});
const noOverflow = async () =>
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "horizontal page overflow",
  );
const select = async (label, value) =>
  page.getByLabel(label, { exact: true }).selectOption(value);
const waitComplete = () =>
  page.getByRole("heading", { name: "전체 대상 평가 완료" }).waitFor();
try {
  await page.goto(base);
  await page.getByRole("button", { name: "검색 시작", exact: true }).waitFor();
  assert.equal(calls, 0, "manual search only");
  await noOverflow();
  await page.getByRole("button", { name: "검색 시작", exact: true }).click();
  await waitComplete();
  assert.equal(calls, 3, "all eligible symbols evaluated");
  await select("표시 모드", "all");
  assert.equal(await page.locator(".result-card").count(), 6);
  await page.getByText("유형 미확인", { exact: true }).first().waitFor();
  const saved = calls;
  await select("표시 모드", "top5");
  await select("최소 점수", "2");
  assert.ok((await page.locator(".result-card").count()) <= 5);
  await select("표시 모드", "four");
  await select("검색 방향", "SHORT");
  await select("표시 모드", "all");
  assert.equal(await page.locator(".result-card").count(), 3);
  assert.equal(calls, saved, "local filters never fetch");
  await page.locator(".result-card button").first().click();
  await page.getByRole("dialog").waitFor();
  await noOverflow();
  assert.equal(
    await page
      .locator('path[aria-label="EMA200"]')
      .getAttribute("stroke-width"),
    "4",
  );
  assert.ok(
    (
      await page.locator('path[aria-label="EMA200"]').getAttribute("d")
    ).includes("L"),
  );
  assert.equal(await page.locator("tbody tr").count(), 10);
  assert.ok(
    (await page.getByRole("dialog").innerText()).includes(
      "TradingView 직접 연결 미확인",
    ),
  );
  await page.getByRole("button", { name: "이전 캔들", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "다음 캔들", exact: true })
      .isEnabled(),
    true,
  );
  await mkdir("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/mobile-detail.png",
    fullPage: false,
  });
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.setViewportSize({ width: 360, height: 780 });
  await noOverflow();
  await page.screenshot({
    path: "test-results/mobile-results.png",
    fullPage: true,
  });
  failStock = true;
  await page.getByRole("button", { name: "검색 시작", exact: true }).click();
  await waitComplete();
  await page.getByText("부분 실패 1종목 · 원인 보기", { exact: true }).click();
  await page.getByText(/fixture individual failure/).waitFor();
  assert.equal(
    await page.locator(".result-card").count(),
    2,
    "failed symbol is not a zero score",
  );
  failStock = false;
  await select("검색 대상", "stock");
  const before = calls;
  await page.getByRole("button", { name: "검색 시작", exact: true }).click();
  await waitComplete();
  assert.equal(calls, before + 1);
  assert.match(await page.locator(".result-card").innerText(), /STOCKUSDT/);
  await select("검색 대상", "crypto");
  await page.getByRole("button", { name: "검색 시작", exact: true }).click();
  await waitComplete();
  assert.match(await page.locator(".result-card").innerText(), /BTCUSDT/);
  failList = true;
  await page.getByRole("button", { name: "검색 시작", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "전체 검색 실패" }).waitFor();
  assert.equal(await page.locator(".result-card").count(), 0);
  failList = false;
  slow = true;
  await select("검색 대상", "all");
  await page.getByRole("button", { name: "검색 시작", exact: true }).click();
  await page
    .getByRole("heading", { name: "검색 진행 중 · 부분 결과" })
    .waitFor();
  await page.getByRole("button", { name: "검색 취소", exact: true }).click();
  await page.getByRole("heading", { name: "검색 취소 · 부분 결과" }).waitFor();
  slow = false;
  await page.getByRole("button", { name: "검색 시작", exact: true }).click();
  await waitComplete();
  await page.setViewportSize({ width: 1100, height: 850 });
  await noOverflow();
  await page.screenshot({
    path: "test-results/desktop-results.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS browser: 360/375px mobile and desktop, full universe, volume filter, unknown/stock/crypto markets, local filters without API, chart/EMA/detail, forming-bar exclusion fixture, failure/partial failure, cancellation, no runtime errors. Synthetic fixtures only.",
  );
} finally {
  await browser.close();
}
