import { prisma } from '../../lib/prisma.js';

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { start, end };
}

function yearRange(year: number) {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 11, 31));
  return { start, end };
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/** Дежурства с начала периода по сегодня (включительно). */
function actualRange(
  bounds: { start: Date; end: Date },
  today: Date,
): { start: Date; end: Date } | null {
  if (today < bounds.start) return null;
  return { start: bounds.start, end: today < bounds.end ? today : bounds.end };
}

/** Дежурства после сегодня до конца периода. */
function plannedRange(
  bounds: { start: Date; end: Date },
  today: Date,
): { start: Date; end: Date } | null {
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (tomorrow > bounds.end) return null;
  return {
    start: tomorrow < bounds.start ? bounds.start : tomorrow,
    end: bounds.end,
  };
}

async function countDutiesByUser(
  range: { start: Date; end: Date } | null,
): Promise<Map<string, number>> {
  if (!range || range.start > range.end) return new Map();

  const rows = await prisma.dutyAssignment.groupBy({
    by: ['userId'],
    where: {
      userId: { not: null },
      dutyDate: { gte: range.start, lte: range.end },
    },
    _count: true,
  });

  return countMap(
    rows.map((r) => ({ userId: r.userId, _count: r._count })),
  );
}

type AbsenceByType = { type: string; count: number; dates: string[] };

function buildAbsenceByType(
  rows: Array<{ absenceType: string; absenceDate: Date }>,
): AbsenceByType[] {
  const byType = new Map<string, string[]>();
  for (const row of rows) {
    const dates = byType.get(row.absenceType) ?? [];
    dates.push(formatDate(row.absenceDate));
    byType.set(row.absenceType, dates);
  }
  return [...byType.entries()]
    .map(([type, dates]) => ({
      type,
      count: dates.length,
      dates: dates.sort(),
    }))
    .sort((a, b) => a.type.localeCompare(b.type, 'ru'));
}

function countMap(
  groups: Array<{ userId: string | null; _count: number }>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const g of groups) {
    if (g.userId) map.set(g.userId, g._count);
  }
  return map;
}

function absenceCountMap(
  groups: Array<{ userId: string; _count: number }>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const g of groups) {
    map.set(g.userId, (map.get(g.userId) ?? 0) + g._count);
  }
  return map;
}

export async function getAdminStatistics(year: number, month: number) {
  const monthBounds = monthRange(year, month);
  const yearBounds = yearRange(year);
  const today = todayUtc();
  const monthActualBounds = actualRange(monthBounds, today);
  const monthPlannedBounds = plannedRange(monthBounds, today);
  const yearActualBounds = actualRange(yearBounds, today);
  const yearPlannedBounds = plannedRange(yearBounds, today);

  const users = await prisma.user.findMany({
    where: { status: 'approved' },
    select: { id: true, fullName: true },
    orderBy: { fullName: 'asc' },
  });

  const [
    dutiesMonthActual,
    dutiesMonthPlanned,
    dutiesYearActual,
    dutiesYearPlanned,
    absencesMonth,
    absencesYear,
    absenceDetailsYear,
  ] = await Promise.all([
    countDutiesByUser(monthActualBounds),
    countDutiesByUser(monthPlannedBounds),
    countDutiesByUser(yearActualBounds),
    countDutiesByUser(yearPlannedBounds),
    prisma.userAbsence.groupBy({
      by: ['userId'],
      where: {
        absenceDate: { gte: monthBounds.start, lte: monthBounds.end },
      },
      _count: true,
    }),
    prisma.userAbsence.groupBy({
      by: ['userId'],
      where: {
        absenceDate: { gte: yearBounds.start, lte: yearBounds.end },
      },
      _count: true,
    }),
    prisma.userAbsence.findMany({
      where: {
        absenceDate: { gte: yearBounds.start, lte: yearBounds.end },
      },
      select: { userId: true, absenceDate: true, absenceType: true },
      orderBy: [{ absenceDate: 'asc' }],
    }),
  ]);

  const absencesMonthMap = absenceCountMap(absencesMonth);
  const absencesYearMap = absenceCountMap(absencesYear);

  const absencesByUserMonth = new Map<string, Array<{ absenceType: string; absenceDate: Date }>>();
  const absencesByUserYear = new Map<string, Array<{ absenceType: string; absenceDate: Date }>>();

  for (const row of absenceDetailsYear) {
    const yearList = absencesByUserYear.get(row.userId) ?? [];
    yearList.push({ absenceType: row.absenceType, absenceDate: row.absenceDate });
    absencesByUserYear.set(row.userId, yearList);

    if (row.absenceDate >= monthBounds.start && row.absenceDate <= monthBounds.end) {
      const monthList = absencesByUserMonth.get(row.userId) ?? [];
      monthList.push({ absenceType: row.absenceType, absenceDate: row.absenceDate });
      absencesByUserMonth.set(row.userId, monthList);
    }
  }

  return {
    year,
    month,
    asOfDate: formatDate(today),
    users: users.map((user) => {
      const monthActual = dutiesMonthActual.get(user.id) ?? 0;
      const monthPlanned = dutiesMonthPlanned.get(user.id) ?? 0;
      const yearActual = dutiesYearActual.get(user.id) ?? 0;
      const yearPlanned = dutiesYearPlanned.get(user.id) ?? 0;

      return {
        id: user.id,
        fullName: user.fullName,
        duties: {
          month: monthActual + monthPlanned,
          year: yearActual + yearPlanned,
          monthActual,
          monthPlanned,
          yearActual,
          yearPlanned,
        },
        absences: {
          month: absencesMonthMap.get(user.id) ?? 0,
          year: absencesYearMap.get(user.id) ?? 0,
          monthByType: buildAbsenceByType(absencesByUserMonth.get(user.id) ?? []),
          yearByType: buildAbsenceByType(absencesByUserYear.get(user.id) ?? []),
        },
      };
    }),
  };
}
