import { randomUUID } from 'crypto';
import { DutySection } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { ABSENCE_TYPES } from '../../lib/absence-types.js';
import { eachDateInRange, formatDate, parseDate } from '../../lib/date-range.js';
import { bumpDayRevisionsInRange } from '../../lib/duty-day-revision.js';
import { recordDutySlotChange } from '../../lib/record-duty-slot-change.js';
import {
  dispatchNotification,
  notifyDutyAssignmentChange,
} from '../notifications/notifications.dispatch.js';

export type AbsenceRecord = {
  userId: string;
  fullName: string;
  date: string;
  absenceType: string;
};

export type UpsertAbsencesResult = {
  upserted: number;
  dutiesRemoved: number;
  affectedDates: string[];
  revisionsBumped: string[];
};

export type DeleteAbsencesResult = {
  deleted: number;
};

export function listAbsenceTypes(): string[] {
  return [...ABSENCE_TYPES];
}

export async function listAbsences(input: {
  from: string;
  to: string;
  userId?: string;
}): Promise<{ absences: AbsenceRecord[] }> {
  const from = parseDate(input.from);
  const to = parseDate(input.to);

  const rows = await prisma.userAbsence.findMany({
    where: {
      absenceDate: { gte: from, lte: to },
      ...(input.userId ? { userId: input.userId } : {}),
    },
    include: {
      user: { select: { fullName: true } },
    },
    orderBy: [{ absenceDate: 'asc' }, { user: { fullName: 'asc' } }],
  });

  return {
    absences: rows.map((row) => ({
      userId: row.userId,
      fullName: row.user.fullName,
      date: formatDate(row.absenceDate),
      absenceType: row.absenceType,
    })),
  };
}

export async function upsertAbsences(
  input: {
    userId: string;
    dateFrom: string;
    dateTo: string;
    absenceType: string;
  },
  adminId: string,
): Promise<UpsertAbsencesResult> {
  const user = await prisma.user.findFirst({
    where: { id: input.userId, status: 'approved' },
    select: { id: true, fullName: true },
  });
  if (!user) {
    throw new AppError(400, 'Пользователь не найден или не подтверждён');
  }

  const dates = eachDateInRange(input.dateFrom, input.dateTo);
  if (dates.length === 0) {
    throw new AppError(400, 'Некорректный диапазон дат');
  }

  const rangeFrom = parseDate(input.dateFrom);
  const rangeTo = parseDate(input.dateTo);
  const batchId = randomUUID();
  const changeIds: string[] = [];
  let dutiesRemoved = 0;
  const revisionsBumped = new Set<string>();

  await prisma.$transaction(async (tx) => {
    await bumpDayRevisionsInRange(tx, rangeFrom, rangeTo, adminId);
    for (const dateStr of dates) {
      revisionsBumped.add(dateStr);
    }

    for (const dateStr of dates) {
      const absenceDate = parseDate(dateStr);
      await tx.userAbsence.upsert({
        where: {
          userId_absenceDate: {
            userId: input.userId,
            absenceDate,
          },
        },
        create: {
          userId: input.userId,
          absenceDate,
          absenceType: input.absenceType,
        },
        update: {
          absenceType: input.absenceType,
        },
      });
    }

    const assignments = await tx.dutyAssignment.findMany({
      where: {
        userId: input.userId,
        dutyDate: { gte: rangeFrom, lte: rangeTo },
      },
    });

    for (const assignment of assignments) {
      const changeId = await recordDutySlotChange({
        tx,
        dutyDate: assignment.dutyDate,
        section: assignment.section as DutySection,
        office: assignment.office,
        previousUserId: assignment.userId,
        newUserId: null,
        source: 'absence',
        batchId,
      });
      if (changeId) {
        changeIds.push(changeId);
        dutiesRemoved += 1;
      }

      await tx.dutyAssignment.update({
        where: { id: assignment.id },
        data: { userId: null },
      });
    }
  });

  for (const changeId of changeIds) {
    dispatchNotification(() => notifyDutyAssignmentChange(changeId));
  }

  return {
    upserted: dates.length,
    dutiesRemoved,
    affectedDates: dates,
    revisionsBumped: [...revisionsBumped],
  };
}

export async function deleteAbsences(input: {
  userId: string;
  dateFrom: string;
  dateTo: string;
}): Promise<DeleteAbsencesResult> {
  const user = await prisma.user.findFirst({
    where: { id: input.userId, status: 'approved' },
    select: { id: true },
  });
  if (!user) {
    throw new AppError(400, 'Пользователь не найден или не подтверждён');
  }

  const rangeFrom = parseDate(input.dateFrom);
  const rangeTo = parseDate(input.dateTo);

  const result = await prisma.userAbsence.deleteMany({
    where: {
      userId: input.userId,
      absenceDate: { gte: rangeFrom, lte: rangeTo },
    },
  });

  return { deleted: result.count };
}
