import { randomUUID } from 'crypto';
import { DutySection } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { matchFioToUserId, buildUserFioIndex } from '../../lib/match-user-by-fio.js';
import { mapDutyTitle } from '../../lib/map-duty-title.js';
import { recordDutySlotChange } from '../../lib/record-duty-slot-change.js';

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isDateInRange(dateStr: string, from: string, to: string): boolean {
  return dateStr >= from && dateStr <= to;
}

export type ImportRecord = {
  fio: string;
  info?: Array<{ fulldate: string; title: number | string }>;
  absence?: Array<{ fulldate: string; absenceType: string }>;
};

export type ImportScheduleInput = {
  replaceFrom: string;
  replaceTo: string;
  records: ImportRecord[];
  adminId: string;
};

export type ImportScheduleResult = {
  importedAbsences: number;
  importedDuties: number;
  changesRecorded: number;
  warnings: string[];
  unknownFio: string[];
};

export async function importSchedule(
  input: ImportScheduleInput,
): Promise<ImportScheduleResult> {
  const replaceFrom = parseDate(input.replaceFrom);
  const replaceTo = parseDate(input.replaceTo);
  const batchId = randomUUID();

  const approvedUsers = await prisma.user.findMany({
    where: { status: 'approved' },
    select: { id: true, fullName: true },
  });

  const { index, ambiguousKeys } = buildUserFioIndex(approvedUsers);

  const warnings: string[] = [];
  const unknownFio: string[] = [];
  const matchedUserIds = new Set<string>();

  let importedAbsences = 0;
  let importedDuties = 0;
  let changesRecorded = 0;

  const absenceRows: Array<{
    userId: string;
    absenceDate: Date;
    absenceType: string;
  }> = [];

  type DutyUpsert = {
    dutyDate: Date;
    dateStr: string;
    section: DutySection;
    office: string;
    userId: string;
  };
  const dutyUpserts: DutyUpsert[] = [];

  for (const record of input.records) {
    const match = matchFioToUserId(record.fio, index, ambiguousKeys);
    if ('ambiguous' in match) {
      warnings.push(`Неоднозначное ФИО: ${record.fio}`);
      unknownFio.push(record.fio);
      continue;
    }
    if ('notFound' in match) {
      unknownFio.push(record.fio);
      continue;
    }

    const userId = match.userId;
    matchedUserIds.add(userId);

    for (const abs of record.absence ?? []) {
      const dateStr =
        typeof abs.fulldate === 'string'
          ? abs.fulldate.slice(0, 10)
          : formatDate(new Date(abs.fulldate));
      if (!isDateInRange(dateStr, input.replaceFrom, input.replaceTo)) {
        warnings.push(
          `Отсутствие ${dateStr} для ${record.fio} вне диапазона импорта`,
        );
        continue;
      }
      absenceRows.push({
        userId,
        absenceDate: parseDate(dateStr),
        absenceType: String(abs.absenceType),
      });
    }

    const absenceDatesInRecord = new Set(
      (record.absence ?? []).map((abs) =>
        typeof abs.fulldate === 'string'
          ? abs.fulldate.slice(0, 10)
          : formatDate(new Date(abs.fulldate)),
      ),
    );

    for (const info of record.info ?? []) {
      const dateStr =
        typeof info.fulldate === 'string'
          ? info.fulldate.slice(0, 10)
          : formatDate(new Date(info.fulldate));

      const slot = mapDutyTitle(info.title);
      if (!slot) {
        warnings.push(`Недопустимый title ${info.title} для ${record.fio}`);
        continue;
      }

      if (absenceDatesInRecord.has(dateStr)) {
        warnings.push(
          `Пропуск дежурства ${dateStr} каб. ${slot.office}: ${record.fio} в отсутствии в этом файле`,
        );
        continue;
      }

      dutyUpserts.push({
        dutyDate: parseDate(dateStr),
        dateStr,
        section: slot.section as DutySection,
        office: slot.office,
        userId,
      });
    }
  }

  await prisma.$transaction(async (tx) => {
    if (matchedUserIds.size > 0) {
      await tx.userAbsence.deleteMany({
        where: {
          userId: { in: [...matchedUserIds] },
          absenceDate: { gte: replaceFrom, lte: replaceTo },
        },
      });
    }

    if (absenceRows.length > 0) {
      await tx.userAbsence.createMany({ data: absenceRows });
      importedAbsences = absenceRows.length;
    }

    for (const duty of dutyUpserts) {
      const existing = await tx.dutyAssignment.findUnique({
        where: {
          dutyDate_section_office: {
            dutyDate: duty.dutyDate,
            section: duty.section,
            office: duty.office,
          },
        },
      });

      const previousUserId = existing?.userId ?? null;

      const recorded = await recordDutySlotChange({
        tx,
        dutyDate: duty.dutyDate,
        section: duty.section,
        office: duty.office,
        previousUserId,
        newUserId: duty.userId,
        source: 'import',
        batchId,
      });
      if (recorded) changesRecorded += 1;

      await tx.dutyAssignment.deleteMany({
        where: {
          dutyDate: duty.dutyDate,
          section: duty.section,
          office: duty.office,
        },
      });

      await tx.dutyAssignment.create({
        data: {
          dutyDate: duty.dutyDate,
          section: duty.section,
          office: duty.office,
          userId: duty.userId,
          assignedBy: input.adminId,
        },
      });
      importedDuties += 1;
    }
  });

  return {
    importedAbsences,
    importedDuties,
    changesRecorded,
    warnings,
    unknownFio,
  };
}
