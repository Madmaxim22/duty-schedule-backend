import type { DutyAssignmentChange, User } from '@prisma/client';
import { formatSurnameWithInitials } from '../../lib/format-name.js';

function personName(user: Pick<User, 'fullName'> | null): string {
  if (!user) return '—';
  return formatSurnameWithInitials(user.fullName);
}

function formatDutyDate(dutyDate: Date): string {
  const y = dutyDate.getUTCFullYear();
  const m = dutyDate.getUTCMonth();
  const d = dutyDate.getUTCDate();
  return new Date(Date.UTC(y, m, d, 12)).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function slotLabel(change: Pick<DutyAssignmentChange, 'office' | 'dutyDate'>): string {
  return `каб. ${change.office}, ${formatDutyDate(change.dutyDate)}`;
}

type ChangeWithUsers = DutyAssignmentChange & {
  previousUser: Pick<User, 'id' | 'fullName'> | null;
  newUser: Pick<User, 'id' | 'fullName'> | null;
};

export function formatDutyChangeForAdmin(change: ChangeWithUsers): string {
  const slot = slotLabel(change);
  switch (change.changeType) {
    case 'assigned':
      return `Назначен: ${personName(change.newUser)} — ${slot}`;
    case 'removed':
      return `Снят: ${personName(change.previousUser)} — ${slot}`;
    case 'replaced':
      return `${personName(change.previousUser)} → ${personName(change.newUser)} — ${slot}`;
    default:
      return `Изменение графика — ${slot}`;
  }
}

export function formatDutyChangeForUser(
  change: ChangeWithUsers,
  recipientUserId: string,
): string | null {
  const slot = slotLabel(change);

  if (change.changeType === 'assigned' && change.newUserId === recipientUserId) {
    return `Вас назначили на дежурство — ${slot}`;
  }

  if (change.changeType === 'removed' && change.previousUserId === recipientUserId) {
    return `Вас сняли с дежурства — ${slot}`;
  }

  if (change.changeType === 'replaced') {
    if (change.newUserId === recipientUserId) {
      return `Вас назначили на дежурство (замена) — ${slot}`;
    }
    if (change.previousUserId === recipientUserId) {
      return `Вас заменили на дежурстве — ${slot}`;
    }
  }

  return null;
}

export function dutyChangePayload(change: DutyAssignmentChange) {
  const y = change.dutyDate.getUTCFullYear();
  const m = String(change.dutyDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(change.dutyDate.getUTCDate()).padStart(2, '0');
  return {
    dutyDate: `${y}-${m}-${d}`,
    section: change.section,
    office: change.office,
    changeType: change.changeType,
    source: change.source,
  };
}

type SwapUser = Pick<User, 'fullName'>;

export function formatDutySwapNotificationBody(
  status: string,
  requester: SwapUser,
  counterparty: SwapUser,
  recipientUserId: string,
  requesterId: string,
): string {
  const requesterName = personName(requester);
  const counterpartyName = personName(counterparty);
  const isRequester = recipientUserId === requesterId;

  switch (status) {
    case 'pending_admin':
      return isRequester
        ? `${counterpartyName} принял(а) заявку — ожидает администратора`
        : `Заявка принята — ожидает администратора`;
    case 'rejected_counterparty':
      return isRequester
        ? `${counterpartyName} отклонил(а) заявку`
        : `Вы отклонили заявку`;
    case 'approved':
      return 'Смена дежурств одобрена администратором';
    case 'rejected_admin':
      return 'Заявка отклонена администратором';
    case 'cancelled':
      return isRequester
        ? 'Вы отменили заявку'
        : `${requesterName} отменил(а) заявку`;
    default:
      return 'Обновление заявки на смену дежурств';
  }
}

export function dutySwapNotificationPayload(input: {
  requestId: string;
  chatRoomId: string | null;
  status: string;
}) {
  return {
    requestId: input.requestId,
    chatRoomId: input.chatRoomId,
    status: input.status,
  };
}
