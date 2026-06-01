import { randomUUID } from 'crypto';
import type { DutySection, DutySwapRequestStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { isValidSlot } from '../../lib/offices.js';
import { lockDayRevision, incrementDayRevision } from '../../lib/duty-day-revision.js';
import { recordDutySlotChange } from '../../lib/record-duty-slot-change.js';
import {
  dispatchNotification,
  notifyDutyAssignmentChange,
  notifyDutySwapStatus,
} from '../notifications/notifications.dispatch.js';
import {
  findOrCreateDirectRoom,
  postDutySwapCardMessage,
  updateDutySwapCardMessage,
} from '../chat/chat.service.js';
import { buildDutySwapCardPayload } from './duty-swap-card-payload.js';

const ACTIVE_STATUSES: DutySwapRequestStatus[] = ['pending_counterparty', 'pending_admin'];
const SWAP_MAX_DAYS_APART = 5;

const userMiniSelect = { id: true, fullName: true, email: true } as const;

const requestInclude = {
  requester: { select: userMiniSelect },
  counterparty: { select: userMiniSelect },
  reviewer: { select: userMiniSelect },
} as const;

type SlotInput = { date: string; section: 'A' | 'B'; office: string };

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isPastDate(dateStr: string): boolean {
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return parseDate(dateStr) < todayUtc;
}

function daysApartUtc(a: string, b: string): number {
  const ms = Math.abs(parseDate(a).getTime() - parseDate(b).getTime());
  return Math.round(ms / 86_400_000);
}

function assertSwapSlotDates(requesterSlot: SlotInput, counterpartySlot: SlotInput) {
  if (daysApartUtc(requesterSlot.date, counterpartySlot.date) > SWAP_MAX_DAYS_APART) {
    throw new AppError(
      400,
      `Дежурства должны быть не более чем за ${SWAP_MAX_DAYS_APART} дней друг от друга`,
    );
  }

  if (isPastDate(requesterSlot.date)) {
    throw new AppError(400, 'Нельзя менять прошедшее дежурство');
  }

  if (isPastDate(counterpartySlot.date)) {
    throw new AppError(400, 'Нельзя менять прошедшее дежурство коллеги');
  }
}

function slotsEqual(a: SlotInput, b: SlotInput): boolean {
  return a.date === b.date && a.section === b.section && a.office === b.office;
}

async function getAssignmentOwner(
  slot: SlotInput,
): Promise<{ userId: string | null; dutyDate: Date }> {
  const dutyDate = parseDate(slot.date);
  const row = await prisma.dutyAssignment.findUnique({
    where: {
      dutyDate_section_office: {
        dutyDate,
        section: slot.section as DutySection,
        office: slot.office,
      },
    },
    select: { userId: true, dutyDate: true },
  });
  return { userId: row?.userId ?? null, dutyDate };
}

async function assertUserApproved(userId: string, label: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, status: 'approved' },
    select: { id: true },
  });
  if (!user) {
    throw new AppError(400, `${label}: пользователь не найден или не подтверждён`);
  }
}

async function assertNotAbsent(userId: string, dutyDate: Date, fullName?: string) {
  const absent = await prisma.userAbsence.findUnique({
    where: { userId_absenceDate: { userId, absenceDate: dutyDate } },
  });
  if (absent) {
    const who = fullName ?? 'Пользователь';
    throw new AppError(400, `${who} отсутствует (${absent.absenceType}) ${formatDate(dutyDate)}`);
  }
}

async function assertNoActiveSwapOnSlots(slots: SlotInput[], excludeId?: string) {
  const orConditions: Prisma.DutySwapRequestWhereInput[] = [];
  for (const slot of slots) {
    const dutyDate = parseDate(slot.date);
    const section = slot.section as DutySection;
    orConditions.push(
      {
        requesterDutyDate: dutyDate,
        requesterSection: section,
        requesterOffice: slot.office,
      },
      {
        counterpartyDutyDate: dutyDate,
        counterpartySection: section,
        counterpartyOffice: slot.office,
      },
    );
  }

  const conflict = await prisma.dutySwapRequest.findFirst({
    where: {
      status: { in: ACTIVE_STATUSES },
      ...(excludeId ? { id: { not: excludeId } } : {}),
      OR: orConditions,
    },
    select: { id: true },
  });

  if (conflict) {
    throw new AppError(409, 'На один из слотов уже есть активная заявка на смену');
  }
}

function mapRequest(row: Prisma.DutySwapRequestGetPayload<{ include: typeof requestInclude }>) {
  return {
    id: row.id,
    status: row.status,
    reason: row.reason,
    requesterSlot: {
      date: formatDate(row.requesterDutyDate),
      section: row.requesterSection,
      office: row.requesterOffice,
    },
    counterpartySlot: {
      date: formatDate(row.counterpartyDutyDate),
      section: row.counterpartySection,
      office: row.counterpartyOffice,
    },
    counterpartyRejectReason: row.counterpartyRejectReason,
    counterpartyRespondedAt: row.counterpartyRespondedAt?.toISOString() ?? null,
    adminComment: row.adminComment,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    chatRoomId: row.chatRoomId,
    chatMessageId: row.chatMessageId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    requester: row.requester,
    counterparty: row.counterparty,
    reviewer: row.reviewer,
  };
}

export async function createDutySwapRequest(
  requesterId: string,
  input: {
    requesterSlot: SlotInput;
    counterpartySlot: SlotInput;
    reason: string;
  },
) {
  const { requesterSlot, counterpartySlot, reason } = input;

  if (slotsEqual(requesterSlot, counterpartySlot)) {
    throw new AppError(400, 'Нельзя выбрать один и тот же слот');
  }

  for (const slot of [requesterSlot, counterpartySlot]) {
    if (!isValidSlot(slot.section, slot.office)) {
      throw new AppError(400, `Недопустимый слот: ${slot.section}/${slot.office}`);
    }
  }

  assertSwapSlotDates(requesterSlot, counterpartySlot);

  const [reqOwner, cpOwner] = await Promise.all([
    getAssignmentOwner(requesterSlot),
    getAssignmentOwner(counterpartySlot),
  ]);

  if (reqOwner.userId !== requesterId) {
    throw new AppError(403, 'Вы не назначены на выбранный свой слот');
  }

  if (!cpOwner.userId) {
    throw new AppError(400, 'Выбранный слот второго участника не занят');
  }

  if (cpOwner.userId === requesterId) {
    throw new AppError(400, 'Нельзя сменить дежурство с самим собой');
  }

  const counterpartyId = cpOwner.userId;

  await Promise.all([
    assertUserApproved(requesterId, 'Инициатор'),
    assertUserApproved(counterpartyId, 'Второй участник'),
    assertNotAbsent(requesterId, reqOwner.dutyDate),
    assertNotAbsent(counterpartyId, cpOwner.dutyDate),
    assertNoActiveSwapOnSlots([requesterSlot, counterpartySlot]),
  ]);

  const request = await prisma.dutySwapRequest.create({
    data: {
      requesterId,
      counterpartyId,
      requesterDutyDate: reqOwner.dutyDate,
      requesterSection: requesterSlot.section as DutySection,
      requesterOffice: requesterSlot.office,
      counterpartyDutyDate: cpOwner.dutyDate,
      counterpartySection: counterpartySlot.section as DutySection,
      counterpartyOffice: counterpartySlot.office,
      reason,
      status: 'pending_counterparty',
    },
    include: requestInclude,
  });

  const { room } = await findOrCreateDirectRoom(requesterId, counterpartyId);
  const chatMessage = await postDutySwapCardMessage({
    roomId: room.id,
    authorId: requesterId,
    swapRequest: request,
  });

  const updated = await prisma.dutySwapRequest.update({
    where: { id: request.id },
    data: {
      chatRoomId: room.id,
      chatMessageId: chatMessage.id,
    },
    include: requestInclude,
  });

  return { request: mapRequest(updated), chatRoomId: room.id };
}

export async function listMyDutySwaps(
  userId: string,
  role: 'outgoing' | 'incoming' | 'all',
  status?: DutySwapRequestStatus,
) {
  const where: Prisma.DutySwapRequestWhereInput = {};

  if (role === 'outgoing') {
    where.requesterId = userId;
  } else if (role === 'incoming') {
    where.counterpartyId = userId;
  } else {
    where.OR = [{ requesterId: userId }, { counterpartyId: userId }];
  }

  if (status) {
    where.status = status;
  }

  const rows = await prisma.dutySwapRequest.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
    include: requestInclude,
  });

  return { requests: rows.map(mapRequest) };
}

export async function getDutySwapRequest(id: string, userId: string, isAdmin: boolean) {
  const row = await prisma.dutySwapRequest.findUnique({
    where: { id },
    include: requestInclude,
  });

  if (!row) {
    throw new AppError(404, 'Заявка не найдена');
  }

  if (!isAdmin && row.requesterId !== userId && row.counterpartyId !== userId) {
    throw new AppError(403, 'Нет доступа к этой заявке');
  }

  return { request: mapRequest(row) };
}

export async function respondToDutySwap(
  id: string,
  counterpartyId: string,
  action: 'accept' | 'reject',
  rejectReason?: string,
) {
  const row = await prisma.dutySwapRequest.findUnique({
    where: { id },
    include: requestInclude,
  });

  if (!row) {
    throw new AppError(404, 'Заявка не найдена');
  }

  if (row.counterpartyId !== counterpartyId) {
    throw new AppError(403, 'Только второй участник может ответить на заявку');
  }

  if (row.status !== 'pending_counterparty') {
    throw new AppError(409, 'Заявка уже обработана');
  }

  if (action === 'reject' && rejectReason && rejectReason.length > 500) {
    throw new AppError(400, 'Причина отказа слишком длинная');
  }

  const newStatus: DutySwapRequestStatus =
    action === 'accept' ? 'pending_admin' : 'rejected_counterparty';

  const updated = await prisma.dutySwapRequest.update({
    where: { id },
    data: {
      status: newStatus,
      counterpartyRespondedAt: new Date(),
      counterpartyRejectReason: action === 'reject' ? rejectReason?.trim() || null : null,
    },
    include: requestInclude,
  });

  await updateDutySwapCardMessage(updated.id);
  dispatchNotification(() => notifyDutySwapStatus(updated.id));

  return { request: mapRequest(updated) };
}

export async function cancelDutySwapRequest(id: string, requesterId: string) {
  const row = await prisma.dutySwapRequest.findUnique({ where: { id } });

  if (!row) {
    throw new AppError(404, 'Заявка не найдена');
  }

  if (row.requesterId !== requesterId) {
    throw new AppError(403, 'Только инициатор может отменить заявку');
  }

  if (row.status !== 'pending_counterparty' && row.status !== 'pending_admin') {
    throw new AppError(409, 'Заявку нельзя отменить в текущем статусе');
  }

  const updated = await prisma.dutySwapRequest.update({
    where: { id },
    data: { status: 'cancelled' },
    include: requestInclude,
  });

  await updateDutySwapCardMessage(updated.id);
  dispatchNotification(() => notifyDutySwapStatus(updated.id));

  return { request: mapRequest(updated) };
}

export async function listAdminDutySwaps(
  status: DutySwapRequestStatus | 'all',
  limit: number,
  cursor?: string,
) {
  const take = Math.min(Math.max(limit, 1), 100);

  let cursorWhere: Prisma.DutySwapRequestWhereInput | undefined;
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

  const rows = await prisma.dutySwapRequest.findMany({
    take: take + 1,
    where: {
      ...(status !== 'all' ? { status } : {}),
      ...(cursorWhere ?? {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: requestInclude,
  });

  const hasMore = rows.length > take;
  const requests = (hasMore ? rows.slice(0, take) : rows).map(mapRequest);
  const last = requests[requests.length - 1];
  const nextCursor = hasMore && last ? `${last.createdAt}|${last.id}` : null;

  return { requests, nextCursor };
}

async function verifySwapStillValid(
  request: Prisma.DutySwapRequestGetPayload<{ include: typeof requestInclude }>,
) {
  const reqAssignment = await prisma.dutyAssignment.findUnique({
    where: {
      dutyDate_section_office: {
        dutyDate: request.requesterDutyDate,
        section: request.requesterSection,
        office: request.requesterOffice,
      },
    },
    select: { userId: true },
  });

  const cpAssignment = await prisma.dutyAssignment.findUnique({
    where: {
      dutyDate_section_office: {
        dutyDate: request.counterpartyDutyDate,
        section: request.counterpartySection,
        office: request.counterpartyOffice,
      },
    },
    select: { userId: true },
  });

  if (reqAssignment?.userId !== request.requesterId) {
    throw new AppError(409, 'График изменился: инициатор больше не назначен на свой слот');
  }

  if (cpAssignment?.userId !== request.counterpartyId) {
    throw new AppError(409, 'График изменился: второй участник больше не назначен на свой слот');
  }

  await assertNotAbsent(request.requesterId, request.requesterDutyDate, request.requester.fullName);
  await assertNotAbsent(
    request.counterpartyId,
    request.counterpartyDutyDate,
    request.counterparty.fullName,
  );
}

async function applyDutySwapInternal(
  request: Prisma.DutySwapRequestGetPayload<{ include: typeof requestInclude }>,
  adminId: string,
  adminComment: string,
) {
  await verifySwapStillValid(request);

  const batchId = randomUUID();
  const changeIds: string[] = [];

  const uniqueDates = [
    ...new Set([formatDate(request.requesterDutyDate), formatDate(request.counterpartyDutyDate)]),
  ]
    .map(parseDate)
    .sort((a, b) => a.getTime() - b.getTime());

  await prisma.$transaction(async (tx) => {
    const revisions = new Map<string, number>();
    for (const dutyDate of uniqueDates) {
      revisions.set(formatDate(dutyDate), await lockDayRevision(tx, dutyDate));
    }

    const reqAssign = await tx.dutyAssignment.findUniqueOrThrow({
      where: {
        dutyDate_section_office: {
          dutyDate: request.requesterDutyDate,
          section: request.requesterSection,
          office: request.requesterOffice,
        },
      },
    });

    const cpAssign = await tx.dutyAssignment.findUniqueOrThrow({
      where: {
        dutyDate_section_office: {
          dutyDate: request.counterpartyDutyDate,
          section: request.counterpartySection,
          office: request.counterpartyOffice,
        },
      },
    });

    if (reqAssign.userId !== request.requesterId || cpAssign.userId !== request.counterpartyId) {
      throw new AppError(409, 'График изменился, смена невозможна');
    }

    const reqChangeId = await recordDutySlotChange({
      tx,
      dutyDate: request.requesterDutyDate,
      section: request.requesterSection,
      office: request.requesterOffice,
      previousUserId: request.requesterId,
      newUserId: request.counterpartyId,
      source: 'swap',
      batchId,
    });
    if (reqChangeId) changeIds.push(reqChangeId);

    const cpChangeId = await recordDutySlotChange({
      tx,
      dutyDate: request.counterpartyDutyDate,
      section: request.counterpartySection,
      office: request.counterpartyOffice,
      previousUserId: request.counterpartyId,
      newUserId: request.requesterId,
      source: 'swap',
      batchId,
    });
    if (cpChangeId) changeIds.push(cpChangeId);

    await tx.dutyAssignment.update({
      where: { id: reqAssign.id },
      data: { userId: request.counterpartyId, assignedBy: adminId },
    });

    await tx.dutyAssignment.update({
      where: { id: cpAssign.id },
      data: { userId: request.requesterId, assignedBy: adminId },
    });

    for (const dutyDate of uniqueDates) {
      const key = formatDate(dutyDate);
      const rev = revisions.get(key)!;
      await incrementDayRevision(tx, dutyDate, adminId, rev);
    }

    await tx.dutySwapRequest.update({
      where: { id: request.id },
      data: {
        status: 'approved',
        reviewedById: adminId,
        adminComment,
        reviewedAt: new Date(),
      },
    });
  });

  for (const changeId of changeIds) {
    dispatchNotification(() => notifyDutyAssignmentChange(changeId));
  }
}

export async function adminReviewDutySwap(
  id: string,
  adminId: string,
  action: 'approve' | 'reject',
  adminComment: string,
) {
  const row = await prisma.dutySwapRequest.findUnique({
    where: { id },
    include: requestInclude,
  });

  if (!row) {
    throw new AppError(404, 'Заявка не найдена');
  }

  if (row.status !== 'pending_admin') {
    throw new AppError(409, 'Заявка не ожидает решения администратора');
  }

  if (action === 'approve') {
    try {
      await applyDutySwapInternal(row, adminId, adminComment);
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 409) {
        const rejected = await prisma.dutySwapRequest.update({
          where: { id },
          data: {
            status: 'rejected_admin',
            reviewedById: adminId,
            adminComment: `${adminComment} (${err.message})`,
            reviewedAt: new Date(),
          },
          include: requestInclude,
        });
        await updateDutySwapCardMessage(rejected.id);
        dispatchNotification(() => notifyDutySwapStatus(rejected.id));
        return { request: mapRequest(rejected) };
      }
      throw err;
    }
  } else {
    await prisma.dutySwapRequest.update({
      where: { id },
      data: {
        status: 'rejected_admin',
        reviewedById: adminId,
        adminComment,
        reviewedAt: new Date(),
      },
    });
  }

  const updated = await prisma.dutySwapRequest.findUniqueOrThrow({
    where: { id },
    include: requestInclude,
  });

  await updateDutySwapCardMessage(updated.id);
  dispatchNotification(() => notifyDutySwapStatus(updated.id));

  return { request: mapRequest(updated) };
}

export { buildDutySwapCardPayload };
