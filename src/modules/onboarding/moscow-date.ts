import { ONBOARDING_TIMEZONE } from './onboarding.config.js';

type MoscowParts = {
  year: number;
  month: number;
  day: number;
  daysInMonth: number;
};

function parsePart(parts: Intl.DateTimeFormatPart[], type: string): number {
  const value = parts.find((p) => p.type === type)?.value;
  return value ? Number(value) : 0;
}

export function getMoscowParts(date: Date = new Date()): MoscowParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: ONBOARDING_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const parts = formatter.formatToParts(date);
  const year = parsePart(parts, 'year');
  const month = parsePart(parts, 'month');
  const day = parsePart(parts, 'day');
  const daysInMonth = new Date(year, month, 0).getDate();
  return { year, month, day, daysInMonth };
}

export function formatPeriod(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  const label = d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function periodBounds(period: string): { start: Date; end: Date } {
  const [year, month] = period.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { start, end };
}
