import type { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

type Tx = Prisma.TransactionClient;

export async function getDayRevision(dutyDate: Date): Promise<number> {
  const row = await prisma.dutyDayRevision.findUnique({ where: { dutyDate } });
  return row?.revision ?? 0;
}

/** Ensures a row exists and returns current revision under row lock. */
export async function lockDayRevision(tx: Tx, dutyDate: Date): Promise<number> {
  await tx.$executeRaw`
    INSERT INTO duty_day_revisions (duty_date, revision, updated_at)
    VALUES (${dutyDate}::date, 0, NOW())
    ON CONFLICT (duty_date) DO NOTHING
  `;

  const rows = await tx.$queryRaw<{ revision: number }[]>`
    SELECT revision FROM duty_day_revisions
    WHERE duty_date = ${dutyDate}::date
    FOR UPDATE
  `;

  return rows[0]?.revision ?? 0;
}

export async function incrementDayRevision(
  tx: Tx,
  dutyDate: Date,
  adminId: string,
  currentRevision: number,
): Promise<number> {
  const nextRevision = currentRevision + 1;
  await tx.dutyDayRevision.update({
    where: { dutyDate },
    data: { revision: nextRevision, updatedBy: adminId },
  });
  return nextRevision;
}

export async function bumpDayRevisionsInRange(
  tx: Tx,
  from: Date,
  to: Date,
  adminId: string,
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO duty_day_revisions (duty_date, revision, updated_at, updated_by)
    SELECT d::date, 1, NOW(), ${adminId}::text
    FROM generate_series(${from}::date, ${to}::date, INTERVAL '1 day') AS d
    ON CONFLICT (duty_date) DO UPDATE SET
      revision = duty_day_revisions.revision + 1,
      updated_at = NOW(),
      updated_by = EXCLUDED.updated_by
  `;
}
