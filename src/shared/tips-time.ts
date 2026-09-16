/** "23-7" 跨零点；"8" 表示 8 点整。hour ∈ [0,23]。 */
export function inHourRange(hour: number, range: string): boolean {
  const parts = range.split("-").map(Number);
  if (parts.length === 1) return hour === parts[0];
  const start = parts[0] ?? 0;
  const end = parts[1] ?? start;
  if (start <= end) return hour >= start && hour <= end;
  return hour >= start || hour <= end;
}

/** "MM/DD-MM/DD"，支持跨年（12/30-01/02）。 */
export function inDateRange(month: number, day: number, range: string): boolean {
  const [startToken, endToken] = range.split("-");
  if (!startToken || !endToken) return false;
  const [startMonth, startDay] = startToken.split("/").map(Number);
  const [endMonth, endDay] = endToken.split("/").map(Number);
  const start = startMonth * 100 + startDay;
  const end = endMonth * 100 + endDay;
  const current = month * 100 + day;
  if (start <= end) return current >= start && current <= end;
  return current >= start || current <= end;
}
