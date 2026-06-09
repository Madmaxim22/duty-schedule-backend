export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function eachDateInRange(dateFrom: string, dateTo: string): string[] {
  const start = parseDate(dateFrom);
  const end = parseDate(dateTo);
  if (start > end) {
    return [];
  }

  const dates: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    dates.push(formatDate(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}
