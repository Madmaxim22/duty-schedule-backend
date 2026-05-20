import type { DutyChangeSource, DutyChangeType, DutySection, Prisma } from '@prisma/client';

export function resolveChangeType(
  previousUserId: string | null,
  newUserId: string | null,
): DutyChangeType | null {
  if (previousUserId === newUserId) return null;
  if (!previousUserId && newUserId) return 'assigned';
  if (previousUserId && !newUserId) return 'removed';
  return 'replaced';
}

export type RecordDutySlotChangeInput = {
  tx: Prisma.TransactionClient;
  dutyDate: Date;
  section: DutySection;
  office: string;
  previousUserId: string | null;
  newUserId: string | null;
  source: DutyChangeSource;
  batchId: string;
};

export async function recordDutySlotChange(
  input: RecordDutySlotChangeInput,
): Promise<boolean> {
  const changeType = resolveChangeType(input.previousUserId, input.newUserId);
  if (!changeType) return false;

  await input.tx.dutyAssignmentChange.create({
    data: {
      dutyDate: input.dutyDate,
      section: input.section,
      office: input.office,
      previousUserId: input.previousUserId,
      newUserId: input.newUserId,
      changeType,
      source: input.source,
      batchId: input.batchId,
    },
  });
  return true;
}
