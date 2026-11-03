export const time = (v: number | null) =>
  v === null
    ? "—"
    : new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(v);
export const number = (v: number | null) =>
  v === null
    ? "—"
    : new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 4 }).format(v);
export function marketLabel(v: string | undefined) {
  return v === "" || v === "innovation"
    ? "코인"
    : ((
        {
          stock: "주식",
          ETF: "ETF",
          commodity: "원자재",
          forex: "외환",
        } as Record<string, string>
      )[v ?? ""] ?? "유형 미확인");
}
