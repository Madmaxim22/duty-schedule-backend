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

  const users = await prisma.user.findMany({
    where: { status: 'approved' },
    select: { id: true, fullName: true },
    orderBy: { fullName: 'asc' },
  });

  const [
    dutiesMonth,
    dutiesYear,
    absencesMonth,
    absencesYear,
    absenceDetailsYear,
  ] = await Promise.all([
    prisma.dutyAssignment.groupBy({
      by: ['userId'],
      where: {
        userId: { not: null },
        dutyDate: { gte: monthBounds.start, lte: monthBounds.end },
      },
      _count: true,
    }),
    prisma.dutyAssignment.groupBy({
      by: ['userId'],
      where: {
        userId: { not: null },
        dutyDate: { gte: yearBounds.start, lte: yearBounds.end },
      },
      _count: true,
    }),
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

  const dutiesMonthMap = countMap(
    dutiesMonth.map((r) => ({ userId: r.userId, _count: r._count })),
  );
  const dutiesYearMap = countMap(
    dutiesYear.map((r) => ({ userId: r.userId, _count: r._count })),
  );
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
    users: users.map((user) => ({
      id: user.id,
      fullName: user.fullName,
      duties: {
        month: dutiesMonthMap.get(user.id) ?? 0,
        year: dutiesYearMap.get(user.id) ?? 0,
      },
      absences: {
        month: absencesMonthMap.get(user.id) ?? 0,
        year: absencesYearMap.get(user.id) ?? 0,
        monthByType: buildAbsenceByType(absencesByUserMonth.get(user.id) ?? []),
        yearByType: buildAbsenceByType(absencesByUserYear.get(user.id) ?? []),
      },
    })),
  };
}
