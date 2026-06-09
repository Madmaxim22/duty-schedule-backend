import { randomUUID } from 'crypto';
import { DutySection } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import {
  DUTY_SECTIONS,
  getAllSlots,
  isMandatoryOffice,
  isValidSlot,
} from '../../lib/offices.js';
import { AppError } from '../../lib/errors.js';
import { getDayRevision, incrementDayRevision, lockDayRevision } from '../../lib/duty-day-revision.js';
import { recordDutySlotChange } from '../../lib/record-duty-slot-change.js';
import {
  dispatchNotification,
  notifyDutyAssignmentChange,
} from '../notifications/notifications.dispatch.js';

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { start, end };
}

function eachDateInMonth(year: number, month: number): string[] {
  const { start, end } = monthRange(year, month);
  const dates: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    dates.push(formatDate(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

function isDayComplete(
  assignmentsBySlot: Map<string, { userId: string }> | undefined,
): boolean {
  for (const section of DUTY_SECTIONS) {
    for (const office of section.offices) {
      if (!office.mandatory) continue;
      if (!assignmentsBySlot?.has(`${section.id}-${office.code}`)) {
        return false;
      }
    }
  }
  return true;
}

function buildSlotResponse(
  section: 'A' | 'B',
  office: string,
  assignment?: {
    user: {
      id: string;
      fullName: string;
      avatarUrl: string | null;
      currentPhotoId: string | null;
      avatarFocusX: number;
      avatarFocusY: number;
    } | null;
  } | null,
) {
  return {
    section,
    office,
    mandatory: isMandatoryOffice(office),
    user: assignment?.user
      ? {
          id: assignment.user.id,
          fullName: assignment.user.fullName,
          avatarUrl: assignment.user.avatarUrl,
          currentPhotoId: assignment.user.currentPhotoId,
          avatarFocusX: assignment.user.avatarFocusX,
          avatarFocusY: assignment.user.avatarFocusY,
        }
      : null,
  };
}

export async function getMonthSchedule(
  year: number,
  month: number,
  currentUserId: string,
  isAdmin: boolean,
) {
  const { start, end } = monthRange(year, month);

  const [assignments, monthAbsences] = await Promise.all([
    prisma.dutyAssignment.findMany({
      where: {
        dutyDate: { gte: start, lte: end },
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            currentPhotoId: true,
            avatarFocusX: true,
            avatarFocusY: true,
          },
        },
      },
    }),
    prisma.userAbsence.findMany({
      where: {
        absenceDate: { gte: start, lte: end },
      },
      select: {
        userId: true,
        absenceDate: true,
        absenceType: true,
      },
    }),
  ]);

  const absenceByDate = new Map(
    monthAbsences
      .filter((a) => a.userId === currentUserId)
      .map((a) => [formatDate(a.absenceDate), a.absenceType]),
  );

  const absences = monthAbsences.map((a) => ({
    userId: a.userId,
    date: formatDate(a.absenceDate),
    absenceType: a.absenceType,
  }));

  type DayAccum = {
    isMyDuty: boolean;
    duties: Array<{
      section: 'A' | 'B';
      office: string;
      userId: string;
      fullName: string;
      avatarUrl: string | null;
      currentPhotoId: string | null;
      avatarFocusX: number;
      avatarFocusY: number;
    }>;
  };

  const daysMap = new Map<string, DayAccum>();
  const assignmentsByDate = new Map<string, Map<string, { userId: string }>>();

  for (const a of assignments) {
    const dateKey = formatDate(a.dutyDate);
    const existing = daysMap.get(dateKey) ?? { isMyDuty: false, duties: [] };
    if (a.userId === currentUserId) {
      existing.isMyDuty = true;
    }
    if (a.userId && a.user) {
      const slots =
        assignmentsByDate.get(dateKey) ?? new Map<string, { userId: string }>();
      slots.set(`${a.section}-${a.office}`, { userId: a.userId });
      assignmentsByDate.set(dateKey, slots);

      existing.duties.push({
        section: a.section,
        office: a.office,
        userId: a.user.id,
        fullName: a.user.fullName,
        avatarUrl: a.user.avatarUrl,
        currentPhotoId: a.user.currentPhotoId,
        avatarFocusX: a.user.avatarFocusX,
        avatarFocusY: a.user.avatarFocusY,
      });
    }
    daysMap.set(dateKey, existing);
  }

  const days = eachDateInMonth(year, month).map((date) => {
    const accum = daysMap.get(date) ?? { isMyDuty: false, duties: [] };
    accum.duties.sort(
      (x, y) =>
        x.section.localeCompare(y.section) || x.office.localeCompare(y.office),
    );
    const absenceType = absenceByDate.get(date);
    return {
      date,
      isMyDuty: accum.isMyDuty,
      duties: accum.duties,
      isAbsent: absenceType !== undefined,
      ...(absenceType !== undefined ? { absenceType } : {}),
    };
  });

  if (!isAdmin) {
    return {
      year,
      month,
      days,
      absences: absences.filter((a) => a.userId === currentUserId),
    };
  }

  const incompleteDates = eachDateInMonth(year, month).filter(
    (date) => !isDayComplete(assignmentsByDate.get(date)),
  );

  return {
    year,
    month,
    days,
    absences,
    monthCoverage: {
      allComplete: incompleteDates.length === 0,
      incompleteDates,
    },
  };
}

export async function getDaySchedule(dateStr: string, currentUserId?: string) {
  const dutyDate = parseDate(dateStr);

  const [assignments, myAbsence, revision] = await Promise.all([
    prisma.dutyAssignment.findMany({
      where: { dutyDate },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            currentPhotoId: true,
            avatarFocusX: true,
            avatarFocusY: true,
          },
        },
      },
    }),
    currentUserId
      ? prisma.userAbsence.findUnique({
          where: {
            userId_absenceDate: {
              userId: currentUserId,
              absenceDate: dutyDate,
            },
          },
        })
      : Promise.resolve(null),
    getDayRevision(dutyDate),
  ]);

  const byKey = new Map(
    assignments.map((a) => [`${a.section}-${a.office}`, a]),
  );

  const sections = DUTY_SECTIONS.map((section) => ({
    id: section.id,
    label: section.label,
    offices: section.offices.map((office) => {
      const assignment = byKey.get(`${section.id}-${office.code}`);
      return buildSlotResponse(section.id, office.code, assignment);
    }),
  }));

  const warnings: string[] = [];
  for (const section of sections) {
    for (const office of section.offices) {
      if (office.mandatory && !office.user) {
        warnings.push(`Кабинет ${office.office} (секция ${section.id}) не заполнен`);
      }
    }
  }

  return {
    date: dateStr,
    revision,
    sections,
    warnings,
    ...(myAbsence ? { myAbsence: { type: myAbsence.absenceType } } : {}),
  };
}

export async function putDaySchedule(
  dateStr: string,
  assignments: Array<{ section: 'A' | 'B'; office: string; userId: string | null }>,
  adminId: string,
  expectedRevision: number,
) {
  const dutyDate = parseDate(dateStr);
  const expectedSlots = getAllSlots();
  const batchId = randomUUID();

  if (assignments.length !== expectedSlots.length) {
    throw new AppError(400, 'Нужно передать все слоты дня');
  }

  const seen = new Set<string>();
  for (const item of assignments) {
    const key = `${item.section}-${item.office}`;
    if (!isValidSlot(item.section, item.office)) {
      throw new AppError(400, `Недопустимый слот: ${item.section}/${item.office}`);
    }
    if (seen.has(key)) {
      throw new AppError(400, `Дублирующийся слот: ${key}`);
    }
    seen.add(key);

    if (item.userId) {
      const user = await prisma.user.findFirst({
        where: { id: item.userId, status: 'approved' },
      });
      if (!user) {
        throw new AppError(400, `Пользователь не найден или не подтверждён: ${item.userId}`);
      }

      const absent = await prisma.userAbsence.findUnique({
        where: {
          userId_absenceDate: { userId: item.userId, absenceDate: dutyDate },
        },
      });
      if (absent) {
        throw new AppError(
          400,
          `${user.fullName} отсутствует (${absent.absenceType}) ${dateStr}`,
        );
      }
    }
  }

  for (const slot of expectedSlots) {
    if (!seen.has(`${slot.section}-${slot.office}`)) {
      throw new AppError(400, `Отсутствует слот: ${slot.section}/${slot.office}`);
    }
  }

  const changeIds: string[] = [];

  await prisma.$transaction(async (tx) => {
    const currentRevision = await lockDayRevision(tx, dutyDate);
    if (currentRevision !== expectedRevision) {
      throw new AppError(409, 'График на эту дату изменён другим администратором', {
        currentRevision,
        date: dateStr,
      });
    }

    const existingAssignments = await tx.dutyAssignment.findMany({
      where: { dutyDate },
    });
    const existingByKey = new Map(
      existingAssignments.map((a) => [`${a.section}-${a.office}`, a]),
    );

    for (const item of assignments) {
      const key = `${item.section}-${item.office}`;
      const previousUserId = existingByKey.get(key)?.userId ?? null;
      const changeId = await recordDutySlotChange({
        tx,
        dutyDate,
        section: item.section as DutySection,
        office: item.office,
        previousUserId,
        newUserId: item.userId,
        source: 'manual',
        batchId,
      });
      if (changeId) changeIds.push(changeId);
    }

    await tx.dutyAssignment.deleteMany({ where: { dutyDate } });

    const toCreate = assignments
      .filter((a) => a.userId !== null)
      .map((a) => ({
        dutyDate,
        section: a.section as DutySection,
        office: a.office,
        userId: a.userId!,
        assignedBy: adminId,
      }));

    if (toCreate.length > 0) {
      await tx.dutyAssignment.createMany({ data: toCreate });
    }

    await incrementDayRevision(tx, dutyDate, adminId, currentRevision);
  });

  for (const changeId of changeIds) {
    dispatchNotification(() => notifyDutyAssignmentChange(changeId));
  }

  return getDaySchedule(dateStr);
}

export async function listDutyAssignmentChanges(limit: number, cursor?: string) {
  const take = Math.min(Math.max(limit, 1), 100);

  let cursorWhere: object | undefined;
  if (cursor) {
    const [createdAtStr, id] = cursor.split('|');
    if (!createdAtStr || !id) {
      throw new AppError(400, 'Некорректный cursor');
    }
    const createdAt = new Date(createdAtStr);
    cursorWhere = {
      OR: [
        { createdAt: { lt: createdAt } },
        { AND: [{ createdAt }, { id: { lt: id } }] },
      ],
    };
  }

  const rows = await prisma.dutyAssignmentChange.findMany({
    take: take + 1,
    ...(cursorWhere ? { where: cursorWhere } : {}),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: {
      previousUser: { select: { id: true, fullName: true } },
      newUser: { select: { id: true, fullName: true } },
    },
  });

  const hasMore = rows.length > take;
  const changes = (hasMore ? rows.slice(0, take) : rows).map((row) => ({
    id: row.id,
    dutyDate: formatDate(row.dutyDate),
    section: row.section,
    office: row.office,
    changeType: row.changeType,
    source: row.source,
    batchId: row.batchId,
    createdAt: row.createdAt.toISOString(),
    notifiedAt: row.notifiedAt?.toISOString() ?? null,
    previousUser: row.previousUser,
    newUser: row.newUser,
  }));

  const last = changes[changes.length - 1];
  const nextCursor =
    hasMore && last ? `${last.createdAt}|${last.id}` : null;

  return { changes, nextCursor };
}
