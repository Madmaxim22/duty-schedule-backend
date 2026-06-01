import type { DutySection, DutySwapRequestStatus, User } from '@prisma/client';

export type DutySwapSlotPayload = {
  date: string;
  section: DutySection;
  office: string;
};

export type DutySwapCardPayload = {
  swapRequestId: string;
  status: DutySwapRequestStatus;
  requesterSlot: DutySwapSlotPayload;
  counterpartySlot: DutySwapSlotPayload;
  reason: string;
  counterpartyRejectReason: string | null;
  adminComment: string | null;
  requester: { id: string; fullName: string };
  counterparty: { id: string; fullName: string };
};

export const DUTY_SWAP_CARD_BODY = 'Заявка на смену дежурств';

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function buildDutySwapCardPayload(
  request: {
    id: string;
    status: DutySwapRequestStatus;
    requesterDutyDate: Date;
    requesterSection: DutySection;
    requesterOffice: string;
    counterpartyDutyDate: Date;
    counterpartySection: DutySection;
    counterpartyOffice: string;
    reason: string;
    counterpartyRejectReason: string | null;
    adminComment: string | null;
    requester: Pick<User, 'id' | 'fullName'>;
    counterparty: Pick<User, 'id' | 'fullName'>;
  },
): DutySwapCardPayload {
  return {
    swapRequestId: request.id,
    status: request.status,
    requesterSlot: {
      date: formatDate(request.requesterDutyDate),
      section: request.requesterSection,
      office: request.requesterOffice,
    },
    counterpartySlot: {
      date: formatDate(request.counterpartyDutyDate),
      section: request.counterpartySection,
      office: request.counterpartyOffice,
    },
    reason: request.reason,
    counterpartyRejectReason: request.counterpartyRejectReason,
    adminComment: request.adminComment,
    requester: { id: request.requester.id, fullName: request.requester.fullName },
    counterparty: { id: request.counterparty.id, fullName: request.counterparty.fullName },
  };
}
