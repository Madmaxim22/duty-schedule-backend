import { randomUUID } from 'crypto';
import type { ChatRoomType, UserRole } from '@prisma/client';
import { env } from '../../config/env.js';
import {
  extensionFromUrl,
  removeChatAttachmentAssets,
  removeChatAttachmentFile,
  sanitizeChatFileName,
  saveChatAttachmentImage,
} from '../../lib/chat-attachments.js';
import {
  assertHomogeneousAttachmentKinds,
  attachmentPreviewLabel,
  isChatImageMime,
  isChatVideoMime,
} from '../../lib/chat-attachment-kind.js';
import { saveChatAttachmentVideo } from '../../lib/chat-video.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import {
  dispatchNotification,
  notifyChatMessage,
} from '../notifications/notifications.dispatch.js';
import { broadcastToRoom, broadcastToUser } from '../../ws/chat-ws.server.js';
import type {
  ChatAttachmentDto,
  ChatMessageDto,
  ChatMessageReplyToDto,
  ChatReactionSummaryDto,
  ChatRoomListItemDto,
} from '../../ws/chat-ws.types.js';
import { compareReactionEmojis } from './chat-reactions.constants.js';
import { userAvatarMiniSelect, userAvatarPublicSelect } from '../../lib/user-avatar-select.js';
import {
  buildDutySwapCardPayload,
  DUTY_SWAP_CARD_BODY,
  type DutySwapCardPayload,
} from '../duty-swaps/duty-swap-card-payload.js';

const authorSelect = {
  ...userAvatarPublicSelect,
  role: true,
} as const;

const contactSelect = userAvatarPublicSelect;

const REPLY_BODY_MAX = 120;
export const DELETED_MESSAGE_BODY = 'Сообщение удалено';

const replyToSelect = {
  id: true,
  body: true,
  deletedAt: true,
  author: { select: { id: true, fullName: true } },
  attachments: { take: 10, select: { mimeType: true } },
} as const;

const lastMessageSelect = {
  kind: true,
  body: true,
  createdAt: true,
  replyToMessageId: true,
  deletedAt: true,
  attachments: { take: 10, select: { id: true, mimeType: true } },
} as const;

function visibleMessagesForUser(userId: string) {
  return { hides: { none: { userId } } } as const;
}

const attachmentSelect = {
  id: true,
  fileName: true,
  mimeType: true,
  size: true,
  width: true,
  height: true,
  url: true,
  posterUrl: true,
  durationMs: true,
} as const;

const messageInclude = {
  author: { select: authorSelect },
  replyTo: { select: replyToSelect },
  attachments: { orderBy: { createdAt: 'asc' as const }, select: attachmentSelect },
} as const;

function mapAttachment(row: {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  url: string;
  posterUrl?: string | null;
  durationMs?: number | null;
}): ChatAttachmentDto {
  return {
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    size: row.size,
    ...(row.width != null && row.height != null ? { width: row.width, height: row.height } : {}),
    url: row.url,
    ...(row.posterUrl ? { posterUrl: row.posterUrl } : {}),
    ...(row.durationMs != null ? { durationMs: row.durationMs } : {}),
  };
}

function replyQuoteBody(body: string, attachmentMimeTypes: string[] = []): string {
  const trimmed = body.trim();
  if (trimmed.length > 0) return truncateReplyBody(trimmed);
  if (attachmentMimeTypes.length > 0) return attachmentPreviewLabel(attachmentMimeTypes);
  return '';
}

function directKeyIds(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function truncateReplyBody(body: string, max = REPLY_BODY_MAX): string {
  if (body.length <= max) return body;
  return `${body.slice(0, max - 1)}…`;
}

type LastMessagePreviewSource = {
  kind?: 'text' | 'duty_swap_request';
  body: string;
  replyToMessageId: string | null;
  deletedAt?: Date | null;
  attachments: { id: string; mimeType: string }[];
};

function formatLastMessagePreview(last: LastMessagePreviewSource): string {
  if (last.deletedAt) return DELETED_MESSAGE_BODY;
  if (last.kind === 'duty_swap_request') return DUTY_SWAP_CARD_BODY;
  const attachmentLabel =
    last.attachments.length > 0
      ? attachmentPreviewLabel(last.attachments.map((a) => a.mimeType))
      : '';
  const base = last.body.trim() || attachmentLabel;
  return last.replyToMessageId ? `↩ ${truncateReplyBody(base)}` : base;
}

function mapReplyTo(
  replyTo: {
    id: string;
    body: string;
    deletedAt?: Date | null;
    author: { id: string; fullName: string };
    attachments?: { mimeType: string }[];
  } | null | undefined,
): ChatMessageReplyToDto | undefined {
  if (!replyTo) return undefined;
  const mimeTypes = replyTo.attachments?.map((a) => a.mimeType) ?? [];
  const body = replyTo.deletedAt ? DELETED_MESSAGE_BODY : replyQuoteBody(replyTo.body, mimeTypes);
  return {
    id: replyTo.id,
    body,
    author: { id: replyTo.author.id, fullName: replyTo.author.fullName },
  };
}

function mapMessage(row: {
  id: string;
  kind?: 'text' | 'duty_swap_request';
  body: string;
  payload?: unknown;
  createdAt: Date;
  deletedAt?: Date | null;
  editedAt?: Date | null;
  author: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
    currentPhotoId: string | null;
    avatarFocusX: number;
    avatarFocusY: number;
    role: UserRole;
  };
  replyTo?: {
    id: string;
    body: string;
    deletedAt?: Date | null;
    author: { id: string; fullName: string };
  } | null;
  attachments?: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    size: number;
    width: number | null;
    height: number | null;
    url: string;
    posterUrl?: string | null;
    durationMs?: number | null;
  }>;
},
  reactions: ChatReactionSummaryDto[] = [],
  status?: 'sent' | 'delivered' | 'read',
): ChatMessageDto {
  const replyTo = mapReplyTo(row.replyTo);
  const author = {
    id: row.author.id,
    fullName: row.author.fullName,
    avatarUrl: row.author.avatarUrl,
    currentPhotoId: row.author.currentPhotoId,
    avatarFocusX: row.author.avatarFocusX,
    avatarFocusY: row.author.avatarFocusY,
    role: row.author.role,
  };

  if (row.deletedAt) {
    return {
      id: row.id,
      kind: row.kind ?? 'text',
      body: DELETED_MESSAGE_BODY,
      deleted: true,
      createdAt: row.createdAt.toISOString(),
      reactions: [],
      author,
      ...(replyTo ? { replyTo } : {}),
      ...(status ? { status } : {}),
    };
  }

  const attachments = row.attachments?.map(mapAttachment);
  const kind = row.kind ?? 'text';
  return {
    id: row.id,
    kind,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    reactions,
    ...(kind === 'duty_swap_request' && row.payload
      ? { payload: row.payload as DutySwapCardPayload }
      : {}),
    ...(row.editedAt ? { editedAt: row.editedAt.toISOString() } : {}),
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
    author,
    ...(replyTo ? { replyTo } : {}),
    ...(status ? { status } : {}),
  };
}

type ReactionAggregateEntry = {
  count: number;
  reactedByMe: boolean;
  reactors: ChatReactionSummaryDto['reactors'];
};

function aggregateReactions(
  rows: Array<{
    messageId: string;
    emoji: string;
    userId: string;
    user: {
      id: string;
      fullName: string;
      avatarUrl: string | null;
      avatarFocusX: number;
      avatarFocusY: number;
    };
  }>,
  viewerId: string,
): Map<string, ChatReactionSummaryDto[]> {
  const byMessage = new Map<string, Map<string, ReactionAggregateEntry>>();

  for (const row of rows) {
    let emojiMap = byMessage.get(row.messageId);
    if (!emojiMap) {
      emojiMap = new Map();
      byMessage.set(row.messageId, emojiMap);
    }
    const entry = emojiMap.get(row.emoji) ?? { count: 0, reactedByMe: false, reactors: [] };
    if (!entry.reactors.some((reactor) => reactor.id === row.userId)) {
      entry.reactors.push({
        id: row.user.id,
        fullName: row.user.fullName,
        avatarUrl: row.user.avatarUrl,
        avatarFocusX: row.user.avatarFocusX,
        avatarFocusY: row.user.avatarFocusY,
      });
      entry.count += 1;
    }
    if (row.userId === viewerId) entry.reactedByMe = true;
    emojiMap.set(row.emoji, entry);
  }

  const result = new Map<string, ChatReactionSummaryDto[]>();
  for (const [messageId, emojiMap] of byMessage) {
    const summaries = [...emojiMap.entries()]
      .map(([emoji, data]) => ({
        emoji,
        count: data.count,
        reactedByMe: data.reactedByMe,
        reactors: data.reactors,
      }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return compareReactionEmojis(a.emoji, b.emoji);
      });
    result.set(messageId, summaries);
  }
  return result;
}

async function loadReactionsByMessageIds(messageIds: string[], viewerId: string) {
  if (messageIds.length === 0) return new Map<string, ChatReactionSummaryDto[]>();

  const rows = await prisma.chatMessageReaction.findMany({
    where: { messageId: { in: messageIds } },
    select: {
      messageId: true,
      emoji: true,
      userId: true,
      user: { select: userAvatarMiniSelect },
    },
  });

  return aggregateReactions(rows, viewerId);
}

async function getMessageReactions(messageId: string, viewerId: string) {
  const map = await loadReactionsByMessageIds([messageId], viewerId);
  return map.get(messageId) ?? [];
}

async function assertMessageInRoom(roomId: string, messageId: string) {
  const message = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    select: { id: true, roomId: true, deletedAt: true },
  });
  if (!message || message.roomId !== roomId) {
    throw new AppError(404, 'Сообщение не найдено');
  }
  if (message.deletedAt) {
    throw new AppError(400, 'Нельзя реагировать на удалённое сообщение');
  }
  return message;
}

export type DeleteMessageMode = 'me' | 'everyone';

export async function deleteMessage(
  roomId: string,
  messageId: string,
  userId: string,
  mode: DeleteMessageMode,
) {
  await assertMember(roomId, userId);

  const message = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    select: { id: true, roomId: true, authorId: true, deletedAt: true, createdAt: true },
  });
  if (!message || message.roomId !== roomId) {
    throw new AppError(404, 'Сообщение не найдено');
  }

  if (mode === 'everyone') {
    if (message.authorId !== userId) {
      throw new AppError(403, 'Можно удалить у всех только своё сообщение');
    }
    if (message.deletedAt) {
      throw new AppError(400, 'Сообщение уже удалено');
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const attachments = await tx.chatMessageAttachment.findMany({
        where: { messageId },
        select: { id: true, url: true, posterUrl: true },
      });
      for (const row of attachments) {
        await removeChatAttachmentAssets(row.id, row.url, row.posterUrl);
      }
      if (attachments.length > 0) {
        await tx.chatMessageAttachment.deleteMany({ where: { messageId } });
      }
      await tx.chatMessageReaction.deleteMany({ where: { messageId } });
      await tx.chatMessageDelivery.deleteMany({ where: { messageId } });
      await tx.chatMessage.update({
        where: { id: messageId },
        data: { body: '', deletedAt: now, deletedById: userId },
      });
      await tx.chatRoom.update({
        where: { id: roomId },
        data: { updatedAt: now },
      });
    });

    const row = await prisma.chatMessage.findUniqueOrThrow({
      where: { id: messageId },
      include: messageInclude,
    });
    const room = await prisma.chatRoom.findUnique({
      where: { id: roomId },
      select: { type: true },
    });
    const dto = mapMessage(
      row,
      [],
      room?.type === 'direct' && row.author.id === userId
        ? resolveOwnMessageStatus(row.createdAt, null, false)
        : undefined,
    );

    broadcastToRoom(roomId, { type: 'message.updated', roomId, message: dto });
    await emitRoomUpdates(roomId);
    return { message: dto };
  }

  await prisma.chatMessageUserHide.upsert({
    where: { messageId_userId: { messageId, userId } },
    create: { messageId, userId },
    update: {},
  });

  broadcastToUser(userId, { type: 'message.hidden', roomId, messageId });
  await emitRoomUpdates(roomId);
  return { ok: true as const };
}

export async function editMessage(
  roomId: string,
  messageId: string,
  userId: string,
  body: string,
  attachmentIds: string[],
) {
  await assertMember(roomId, userId);

  const message = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      roomId: true,
      authorId: true,
      body: true,
      deletedAt: true,
      createdAt: true,
      attachments: { select: { id: true, url: true, posterUrl: true } },
    },
  });
  if (!message || message.roomId !== roomId) {
    throw new AppError(404, 'Сообщение не найдено');
  }
  if (message.authorId !== userId) {
    throw new AppError(403, 'Можно редактировать только своё сообщение');
  }
  if (message.deletedAt) {
    throw new AppError(400, 'Нельзя редактировать удалённое сообщение');
  }

  const currentIds = new Set(message.attachments.map((a) => a.id));
  const nextIds = new Set(attachmentIds);

  if (message.body === body && currentIds.size === nextIds.size && [...currentIds].every((id) => nextIds.has(id))) {
    const row = await prisma.chatMessage.findUniqueOrThrow({
      where: { id: messageId },
      include: messageInclude,
    });
    const room = await prisma.chatRoom.findUnique({
      where: { id: roomId },
      select: { type: true, members: { select: { userId: true, lastReadAt: true } } },
    });
    const reactions = await getMessageReactions(messageId, userId);
    const peerMember =
      room?.type === 'direct' ? room.members.find((m) => m.userId !== userId) : null;
    const delivered =
      room?.type === 'direct' && peerMember
        ? await prisma.chatMessageDelivery.findFirst({
            where: { messageId, userId: peerMember.userId },
            select: { messageId: true },
          })
        : null;
    const dto = mapMessage(
      row,
      reactions,
      room?.type === 'direct'
        ? resolveOwnMessageStatus(row.createdAt, peerMember?.lastReadAt ?? null, Boolean(delivered))
        : undefined,
    );
    return { message: dto };
  }

  await assertEditAttachments(attachmentIds, roomId, userId, messageId);

  const toRemove = message.attachments.filter((a) => !nextIds.has(a.id));
  const toAdd = attachmentIds.filter((id) => !currentIds.has(id));

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (const row of toRemove) {
      await removeChatAttachmentAssets(row.id, row.url, row.posterUrl);
    }
    if (toRemove.length > 0) {
      await tx.chatMessageAttachment.deleteMany({
        where: { id: { in: toRemove.map((a) => a.id) } },
      });
    }
    if (toAdd.length > 0) {
      const linked = await tx.chatMessageAttachment.updateMany({
        where: {
          id: { in: toAdd },
          roomId,
          uploaderId: userId,
          messageId: null,
        },
        data: { messageId },
      });
      if (linked.count !== toAdd.length) {
        throw new AppError(400, 'Не удалось привязать вложения');
      }
    }
    await tx.chatMessage.update({
      where: { id: messageId },
      data: { body, editedAt: now },
    });
    await tx.chatRoom.update({
      where: { id: roomId },
      data: { updatedAt: now },
    });
  });

  const row = await prisma.chatMessage.findUniqueOrThrow({
    where: { id: messageId },
    include: messageInclude,
  });
  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: { type: true, members: { select: { userId: true, lastReadAt: true } } },
  });
  const reactions = await getMessageReactions(messageId, userId);
  const peerMember =
    room?.type === 'direct' ? room.members.find((m) => m.userId !== userId) : null;
  const delivered =
    room?.type === 'direct' && peerMember
      ? await prisma.chatMessageDelivery.findFirst({
          where: { messageId, userId: peerMember.userId },
          select: { messageId: true },
        })
      : null;
  const dto = mapMessage(
    row,
    reactions,
    room?.type === 'direct'
      ? resolveOwnMessageStatus(row.createdAt, peerMember?.lastReadAt ?? null, Boolean(delivered))
      : undefined,
  );

  broadcastToRoom(roomId, { type: 'message.updated', roomId, message: dto });
  await emitRoomUpdates(roomId);
  return { message: dto };
}

function broadcastMessageReactions(roomId: string, messageId: string, reactions: ChatReactionSummaryDto[]) {
  broadcastToRoom(roomId, { type: 'message.reaction', roomId, messageId, reactions });
}

export async function setMessageReaction(
  roomId: string,
  messageId: string,
  userId: string,
  emoji: string,
) {
  await assertMember(roomId, userId);
  await assertMessageInRoom(roomId, messageId);

  await prisma.chatMessageReaction.upsert({
    where: { messageId_userId: { messageId, userId } },
    create: { messageId, userId, emoji },
    update: { emoji },
  });

  const reactions = await getMessageReactions(messageId, userId);
  broadcastMessageReactions(roomId, messageId, reactions);
  return { reactions };
}

export async function removeMessageReaction(roomId: string, messageId: string, userId: string) {
  await assertMember(roomId, userId);
  await assertMessageInRoom(roomId, messageId);

  await prisma.chatMessageReaction.deleteMany({
    where: { messageId, userId },
  });

  const reactions = await getMessageReactions(messageId, userId);
  broadcastMessageReactions(roomId, messageId, reactions);
  return { reactions };
}

function resolveOwnMessageStatus(
  createdAt: Date,
  peerLastReadAt: Date | null,
  isDelivered: boolean,
): 'sent' | 'delivered' | 'read' {
  if (peerLastReadAt && peerLastReadAt >= createdAt) return 'read';
  return isDelivered ? 'delivered' : 'sent';
}

async function countUnread(
  roomId: string,
  userId: string,
  lastReadAt: Date | null,
): Promise<number> {
  return prisma.chatMessage.count({
    where: {
      roomId,
      authorId: { not: userId },
      ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
    },
  });
}

function resolveDisplay(
  room: {
    type: ChatRoomType;
    title: string | null;
    members: Array<{
      userId: string;
      user: {
        id: string;
        fullName: string;
        avatarUrl: string | null;
        avatarFocusX: number;
        avatarFocusY: number;
      };
    }>;
  },
  viewerId: string,
): {
  displayName: string;
  displayAvatarUrl: string | null;
  displayAvatarFocusX: number;
  displayAvatarFocusY: number;
} {
  if (room.type === 'group') {
    return {
      displayName: room.title ?? 'Группа',
      displayAvatarUrl: null,
      displayAvatarFocusX: 50,
      displayAvatarFocusY: 50,
    };
  }
  const peer = room.members.find((m) => m.userId !== viewerId);
  return {
    displayName: peer?.user.fullName ?? 'Чат',
    displayAvatarUrl: peer?.user.avatarUrl ?? null,
    displayAvatarFocusX: peer?.user.avatarFocusX ?? 50,
    displayAvatarFocusY: peer?.user.avatarFocusY ?? 50,
  };
}

async function buildRoomListItem(
  roomId: string,
  userId: string,
): Promise<ChatRoomListItemDto | null> {
  const membership = await prisma.chatMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
    include: {
      room: {
        include: {
          messages: {
            where: visibleMessagesForUser(userId),
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: lastMessageSelect,
          },
          members: {
            include: { user: { select: userAvatarMiniSelect } },
          },
        },
      },
    },
  });
  if (!membership) return null;

  const { room } = membership;
  const last = room.messages[0];
  const { displayName, displayAvatarUrl, displayAvatarFocusX, displayAvatarFocusY } =
    resolveDisplay(room, userId);
  const unreadCount = await countUnread(roomId, userId, membership.lastReadAt);

  return {
    id: room.id,
    type: room.type,
    title: room.title,
    displayName,
    displayAvatarUrl,
    displayAvatarFocusX,
    displayAvatarFocusY,
    lastMessagePreview: last ? formatLastMessagePreview(last) : null,
    lastMessageAt: last?.createdAt.toISOString() ?? null,
    unreadCount,
    updatedAt: room.updatedAt.toISOString(),
  };
}

async function assertMember(roomId: string, userId: string) {
  const member = await prisma.chatMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
  });
  if (!member) {
    throw new AppError(403, 'Нет доступа к этому чату');
  }
  return member;
}

async function assertAttachmentsLinkable(
  ids: string[],
  roomId: string,
  uploaderId: string,
): Promise<void> {
  if (ids.length === 0) return;

  const cutoff = new Date(Date.now() - env.chatAttachmentOrphanTtlMs);
  const rows = await prisma.chatMessageAttachment.findMany({
    where: { id: { in: ids } },
  });

  if (rows.length !== ids.length) {
    throw new AppError(400, 'Некорректные вложения');
  }

  assertHomogeneousAttachmentKinds(rows.map((row) => row.mimeType));

  for (const row of rows) {
    if (row.roomId !== roomId) {
      throw new AppError(403, 'Вложение из другого чата');
    }
    if (row.uploaderId !== uploaderId) {
      throw new AppError(403, 'Нельзя использовать чужие вложения');
    }
    if (row.messageId !== null) {
      throw new AppError(400, 'Вложение уже привязано к сообщению');
    }
    if (row.createdAt < cutoff) {
      throw new AppError(400, 'Срок действия вложения истёк, загрузите снова');
    }
  }
}

async function assertEditAttachments(
  ids: string[],
  roomId: string,
  uploaderId: string,
  messageId: string,
): Promise<void> {
  if (ids.length === 0) return;

  const cutoff = new Date(Date.now() - env.chatAttachmentOrphanTtlMs);
  const rows = await prisma.chatMessageAttachment.findMany({
    where: { id: { in: ids } },
  });

  if (rows.length !== ids.length) {
    throw new AppError(400, 'Некорректные вложения');
  }

  assertHomogeneousAttachmentKinds(rows.map((row) => row.mimeType));

  for (const row of rows) {
    if (row.roomId !== roomId) {
      throw new AppError(403, 'Вложение из другого чата');
    }
    if (row.uploaderId !== uploaderId) {
      throw new AppError(403, 'Нельзя использовать чужие вложения');
    }
    if (row.messageId !== null && row.messageId !== messageId) {
      throw new AppError(400, 'Вложение уже привязано к другому сообщению');
    }
    if (row.messageId === null && row.createdAt < cutoff) {
      throw new AppError(400, 'Срок действия вложения истёк, загрузите снова');
    }
  }
}

async function assertApprovedUser(userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, status: 'approved' },
    select: userAvatarPublicSelect,
  });
  if (!user) {
    throw new AppError(404, 'Пользователь не найден');
  }
  return user;
}

export async function getTotalUnread(userId: string) {
  const memberships = await prisma.chatMember.findMany({
    where: { userId },
    select: { roomId: true, lastReadAt: true },
  });

  let count = 0;
  for (const m of memberships) {
    count += await countUnread(m.roomId, userId, m.lastReadAt);
  }
  return { count };
}

export async function listContacts(currentUserId: string) {
  const users = await prisma.user.findMany({
    where: { status: 'approved', id: { not: currentUserId } },
    orderBy: { fullName: 'asc' },
    select: contactSelect,
  });
  return { contacts: users };
}

export async function listMyRooms(userId: string) {
  const memberships = await prisma.chatMember.findMany({
    where: { userId },
    include: {
      room: {
        include: {
          messages: {
            where: visibleMessagesForUser(userId),
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: lastMessageSelect,
          },
          members: {
            include: { user: { select: userAvatarMiniSelect } },
          },
        },
      },
    },
    orderBy: { room: { updatedAt: 'desc' } },
  });

  const rooms: ChatRoomListItemDto[] = [];
  for (const m of memberships) {
    const last = m.room.messages[0];
    const {
      displayName,
      displayAvatarUrl,
      displayAvatarFocusX,
      displayAvatarFocusY,
    } = resolveDisplay(m.room, userId);
    const unreadCount = await countUnread(m.roomId, userId, m.lastReadAt);
    rooms.push({
      id: m.room.id,
      type: m.room.type,
      title: m.room.title,
      displayName,
      displayAvatarUrl,
      displayAvatarFocusX,
      displayAvatarFocusY,
      lastMessagePreview: last ? formatLastMessagePreview(last) : null,
      lastMessageAt: last?.createdAt.toISOString() ?? null,
      unreadCount,
      updatedAt: m.room.updatedAt.toISOString(),
    });
  }

  return { rooms };
}

export async function findOrCreateDirectRoom(currentUserId: string, otherUserId: string) {
  if (currentUserId === otherUserId) {
    throw new AppError(400, 'Нельзя создать чат с самим собой');
  }

  await assertApprovedUser(otherUserId);

  const [userLowId, userHighId] = directKeyIds(currentUserId, otherUserId);

  const existing = await prisma.chatDirectKey.findUnique({
    where: { userLowId_userHighId: { userLowId, userHighId } },
    include: {
      room: {
        include: {
          members: {
            include: { user: { select: contactSelect } },
          },
        },
      },
    },
  });

  if (existing) {
    return { room: mapRoomDetail(existing.room, currentUserId) };
  }

  const room = await prisma.$transaction(async (tx) => {
    const created = await tx.chatRoom.create({
      data: {
        type: 'direct',
        createdBy: currentUserId,
        members: {
          create: [{ userId: currentUserId }, { userId: otherUserId }],
        },
        directKey: {
          create: { userLowId, userHighId },
        },
      },
      include: {
        members: {
          include: { user: { select: { ...contactSelect, role: true as const } } },
        },
      },
    });
    return created;
  });

  return { room: mapRoomDetail(room, currentUserId) };
}

export async function createGroupRoom(
  creatorId: string,
  title: string,
  memberIds: string[],
) {
  const uniqueIds = [...new Set(memberIds.filter((id) => id !== creatorId))];
  if (uniqueIds.length === 0) {
    throw new AppError(400, 'Добавьте хотя бы одного участника');
  }

  const approved = await prisma.user.findMany({
    where: { id: { in: uniqueIds }, status: 'approved' },
    select: { id: true },
  });
  if (approved.length !== uniqueIds.length) {
    throw new AppError(400, 'Все участники должны быть подтверждены');
  }

  const allMemberIds = [creatorId, ...uniqueIds];

  const room = await prisma.chatRoom.create({
    data: {
      type: 'group',
      title,
      createdBy: creatorId,
      members: {
        create: allMemberIds.map((userId) => ({ userId })),
      },
    },
    include: {
      members: {
        include: { user: { select: { ...contactSelect, role: true } } },
      },
    },
  });

  return { room: mapRoomDetail(room, creatorId) };
}

function mapRoomDetail(
  room: {
    id: string;
    type: ChatRoomType;
    title: string | null;
    createdAt: Date;
    updatedAt: Date;
    members: Array<{
      userId: string;
      lastReadAt?: Date | null;
      user: {
        id: string;
        fullName: string;
        avatarUrl: string | null;
        currentPhotoId: string | null;
        avatarFocusX: number;
        avatarFocusY: number;
        role?: UserRole;
      };
    }>;
  },
  viewerId: string,
) {
  const {
    displayName,
    displayAvatarUrl,
    displayAvatarFocusX,
    displayAvatarFocusY,
  } = resolveDisplay(
    {
      type: room.type,
      title: room.title,
      members: room.members.map((m) => ({ userId: m.userId, user: m.user })),
    },
    viewerId,
  );

  return {
    id: room.id,
    type: room.type,
    title: room.title,
    displayName,
    displayAvatarUrl,
    displayAvatarFocusX,
    displayAvatarFocusY,
    createdAt: room.createdAt.toISOString(),
    updatedAt: room.updatedAt.toISOString(),
    members: room.members.map((m) => ({
      id: m.user.id,
      fullName: m.user.fullName,
      avatarUrl: m.user.avatarUrl,
      currentPhotoId: m.user.currentPhotoId,
      avatarFocusX: m.user.avatarFocusX,
      avatarFocusY: m.user.avatarFocusY,
      role: m.user.role,
      lastReadAt: m.lastReadAt?.toISOString() ?? null,
    })),
  };
}

export async function getRoom(roomId: string, userId: string) {
  await assertMember(roomId, userId);

  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    include: {
      members: {
        select: {
          userId: true,
          lastReadAt: true,
          user: { select: { ...contactSelect, role: true } },
        },
      },
    },
  });
  if (!room) {
    throw new AppError(404, 'Чат не найден');
  }

  return { room: mapRoomDetail(room, userId) };
}

export async function getMessages(
  roomId: string,
  userId: string,
  before?: string,
  limit = 50,
) {
  await assertMember(roomId, userId);

  const beforeDate = before ? new Date(before) : undefined;

  const rows = await prisma.chatMessage.findMany({
    where: {
      roomId,
      ...visibleMessagesForUser(userId),
      ...(beforeDate ? { createdAt: { lt: beforeDate } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: messageInclude,
  });

  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: {
      type: true,
      members: { select: { userId: true, lastReadAt: true } },
    },
  });
  if (!room) {
    throw new AppError(404, 'Чат не найден');
  }

  const peerMember =
    room.type === 'direct' ? room.members.find((member) => member.userId !== userId) : null;
  const peerId = peerMember?.userId ?? null;
  const ownMessageIds = peerId
    ? rows.filter((row) => row.author.id === userId).map((row) => row.id)
    : [];
  const deliveredRows =
    ownMessageIds.length > 0 && peerId
      ? await prisma.chatMessageDelivery.findMany({
          where: { userId: peerId, messageId: { in: ownMessageIds } },
          select: { messageId: true },
        })
      : [];
  const deliveredIds = new Set(deliveredRows.map((row) => row.messageId));
  const reactionsByMessage = await loadReactionsByMessageIds(
    rows.map((row) => row.id),
    userId,
  );

  const messages = rows.reverse().map((row) =>
    mapMessage(
      row,
      reactionsByMessage.get(row.id) ?? [],
      room.type === 'direct' && row.author.id === userId && peerId
        ? resolveOwnMessageStatus(row.createdAt, peerMember?.lastReadAt ?? null, deliveredIds.has(row.id))
        : undefined,
    ),
  );
  const nextBefore = rows.length === limit ? rows[0]?.createdAt.toISOString() : null;

  return { messages, nextBefore };
}

export async function markRoomRead(roomId: string, userId: string) {
  await assertMember(roomId, userId);

  const now = new Date();
  await prisma.chatMember.update({
    where: { roomId_userId: { roomId, userId } },
    data: { lastReadAt: now },
  });

  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: { type: true },
  });
  if (room?.type === 'direct') {
    broadcastToRoom(roomId, {
      type: 'read.updated',
      roomId,
      userId,
      lastReadAt: now.toISOString(),
    });
  }

  return { ok: true };
}

export async function recordMessageDelivered(roomId: string, messageId: string, userId: string) {
  const membership = await prisma.chatMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
    select: { roomId: true },
  });
  if (!membership) return;

  const message = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      roomId: true,
      authorId: true,
      createdAt: true,
      room: {
        select: {
          type: true,
          members: { select: { userId: true, lastReadAt: true } },
        },
      },
    },
  });
  if (!message) return;
  if (message.roomId !== roomId) return;
  if (message.authorId === userId) return;
  if (message.room.type !== 'direct') return;

  await prisma.chatMessageDelivery.upsert({
    where: { messageId_userId: { messageId, userId } },
    create: { messageId, userId },
    update: {},
  });

  const peerReadAt = message.room.members.find((member) => member.userId === userId)?.lastReadAt ?? null;
  broadcastToUser(message.authorId, {
    type: 'message.status',
    roomId,
    messageId,
    status: peerReadAt && peerReadAt >= message.createdAt ? 'read' : 'delivered',
  });
}

async function emitRoomUpdates(roomId: string): Promise<void> {
  const members = await prisma.chatMember.findMany({
    where: { roomId },
    select: { userId: true },
  });

  await Promise.all(
    members.map(async (m) => {
      const room = await buildRoomListItem(roomId, m.userId);
      if (room) {
        broadcastToUser(m.userId, { type: 'room.updated', room });
      }
    }),
  );
}

export async function uploadRoomAttachments(
  roomId: string,
  uploaderId: string,
  files: Express.Multer.File[],
) {
  await assertMember(roomId, uploaderId);

  if (!files.length) {
    throw new AppError(400, 'Не выбраны файлы');
  }
  if (files.length > env.maxChatAttachmentsPerMessage) {
    throw new AppError(
      400,
      `Можно прикрепить не более ${env.maxChatAttachmentsPerMessage} файлов`,
    );
  }

  assertHomogeneousAttachmentKinds(files.map((file) => file.mimetype));

  const attachments: ChatAttachmentDto[] = [];

  for (const file of files) {
    if (isChatImageMime(file.mimetype) && file.size > env.maxChatAttachmentSize) {
      const limitMb = Math.round(env.maxChatAttachmentSize / 1024 / 1024);
      throw new AppError(400, `Изображение не больше ${limitMb} МБ`);
    }
    if (isChatVideoMime(file.mimetype) && file.size > env.maxChatVideoAttachmentSize) {
      const limitMb = Math.round(env.maxChatVideoAttachmentSize / 1024 / 1024);
      throw new AppError(400, `Видео не должно превышать ${limitMb} МБ`);
    }

    const id = randomUUID();
    try {
      if (isChatVideoMime(file.mimetype)) {
        const saved = await saveChatAttachmentVideo(id, file.buffer, file.mimetype);
        const row = await prisma.chatMessageAttachment.create({
          data: {
            id,
            roomId,
            uploaderId,
            fileName: sanitizeChatFileName(file.originalname),
            mimeType: saved.mimeType,
            size: saved.size,
            width: saved.width,
            height: saved.height,
            url: saved.url,
            posterUrl: saved.posterUrl,
            durationMs: saved.durationMs,
          },
          select: attachmentSelect,
        });
        attachments.push(mapAttachment(row));
      } else {
        const saved = await saveChatAttachmentImage(id, file.buffer, file.mimetype);
        const row = await prisma.chatMessageAttachment.create({
          data: {
            id,
            roomId,
            uploaderId,
            fileName: sanitizeChatFileName(file.originalname),
            mimeType: saved.mimeType,
            size: saved.size,
            width: saved.width,
            height: saved.height,
            url: saved.url,
          },
          select: attachmentSelect,
        });
        attachments.push(mapAttachment(row));
      }
    } catch (err) {
      await removeChatAttachmentAssets(id, `/uploads/chat/${id}.webp`, null).catch(() => undefined);
      await removeChatAttachmentFile(id, 'gif').catch(() => undefined);
      await removeChatAttachmentFile(id, 'png').catch(() => undefined);
      await removeChatAttachmentFile(id, 'jpg').catch(() => undefined);
      await removeChatAttachmentFile(id, 'mp4').catch(() => undefined);
      await removeChatAttachmentFile(id, 'webm').catch(() => undefined);
      await removeChatAttachmentFile(id, 'mov').catch(() => undefined);
      const { removeChatVideoPoster } = await import('../../lib/chat-video.js');
      await removeChatVideoPoster(id).catch(() => undefined);
      throw err;
    }
  }

  return { attachments };
}

export async function postMessage(
  roomId: string,
  authorId: string,
  body: string,
  replyToMessageId?: string,
  attachmentIds?: string[],
) {
  await assertMember(roomId, authorId);
  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: { type: true },
  });
  if (!room) {
    throw new AppError(404, 'Чат не найден');
  }

  const ids = attachmentIds ?? [];
  await assertAttachmentsLinkable(ids, roomId, authorId);

  if (replyToMessageId) {
    const target = await prisma.chatMessage.findUnique({
      where: { id: replyToMessageId },
      select: { roomId: true },
    });
    if (!target) {
      throw new AppError(404, 'Сообщение для ответа не найдено');
    }
    if (target.roomId !== roomId) {
      throw new AppError(400, 'Нельзя ответить на сообщение из другого чата');
    }
  }

  const author = await prisma.user.findUnique({
    where: { id: authorId },
    select: { id: true, fullName: true, role: true },
  });
  if (!author) {
    throw new AppError(404, 'Пользователь не найден');
  }

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.chatMessage.create({
      data: { roomId, authorId, body, replyToMessageId: replyToMessageId ?? null },
    });

    if (ids.length > 0) {
      const linked = await tx.chatMessageAttachment.updateMany({
        where: {
          id: { in: ids },
          roomId,
          uploaderId: authorId,
          messageId: null,
        },
        data: { messageId: created.id },
      });
      if (linked.count !== ids.length) {
        throw new AppError(400, 'Не удалось привязать вложения');
      }
    }

    await tx.chatRoom.update({
      where: { id: roomId },
      data: { updatedAt: new Date() },
    });

    await tx.chatMember.update({
      where: { roomId_userId: { roomId, userId: authorId } },
      data: { lastReadAt: new Date() },
    });

    return tx.chatMessage.findUniqueOrThrow({
      where: { id: created.id },
      include: messageInclude,
    });
  });

  const dto = mapMessage(message, [], room.type === 'direct' ? 'sent' : undefined);

  broadcastToRoom(roomId, { type: 'message.new', roomId, message: dto });
  await emitRoomUpdates(roomId);

  dispatchNotification(() =>
    notifyChatMessage({
      messageId: message.id,
      roomId,
      authorId: author.id,
      authorFullName: author.fullName,
      body,
      attachmentPreview:
        message.attachments && message.attachments.length > 0
          ? attachmentPreviewLabel(message.attachments.map((a) => a.mimeType))
          : undefined,
    }),
  );

  return { message: dto };
}

const swapRequestInclude = {
  requester: { select: { id: true, fullName: true } },
  counterparty: { select: { id: true, fullName: true } },
} as const;

type SwapRequestForCard = {
  id: string;
  status: import('@prisma/client').DutySwapRequestStatus;
  requesterDutyDate: Date;
  requesterSection: import('@prisma/client').DutySection;
  requesterOffice: string;
  counterpartyDutyDate: Date;
  counterpartySection: import('@prisma/client').DutySection;
  counterpartyOffice: string;
  reason: string;
  counterpartyRejectReason: string | null;
  adminComment: string | null;
  requester: { id: string; fullName: string };
  counterparty: { id: string; fullName: string };
};

export async function postDutySwapCardMessage(input: {
  roomId: string;
  authorId: string;
  swapRequest: SwapRequestForCard;
}) {
  const { roomId, authorId, swapRequest } = input;
  await assertMember(roomId, authorId);

  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: { type: true },
  });
  if (!room) {
    throw new AppError(404, 'Чат не найден');
  }

  const payload = buildDutySwapCardPayload(swapRequest);
  const author = await prisma.user.findUnique({
    where: { id: authorId },
    select: { id: true, fullName: true, role: true },
  });
  if (!author) {
    throw new AppError(404, 'Пользователь не найден');
  }

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.chatMessage.create({
      data: {
        roomId,
        authorId,
        kind: 'duty_swap_request',
        body: DUTY_SWAP_CARD_BODY,
        payload: payload as object,
      },
    });

    await tx.chatRoom.update({
      where: { id: roomId },
      data: { updatedAt: new Date() },
    });

    await tx.chatMember.update({
      where: { roomId_userId: { roomId, userId: authorId } },
      data: { lastReadAt: new Date() },
    });

    return tx.chatMessage.findUniqueOrThrow({
      where: { id: created.id },
      include: messageInclude,
    });
  });

  const dto = mapMessage(message, [], room.type === 'direct' ? 'sent' : undefined);

  broadcastToRoom(roomId, { type: 'message.new', roomId, message: dto });
  await emitRoomUpdates(roomId);

  dispatchNotification(() =>
    notifyChatMessage({
      messageId: message.id,
      roomId,
      authorId: author.id,
      authorFullName: author.fullName,
      body: DUTY_SWAP_CARD_BODY,
    }),
  );

  return { id: message.id, message: dto };
}

export async function updateDutySwapCardMessage(swapRequestId: string): Promise<void> {
  const request = await prisma.dutySwapRequest.findUnique({
    where: { id: swapRequestId },
    include: swapRequestInclude,
  });

  if (!request?.chatMessageId || !request.chatRoomId) {
    return;
  }

  const payload = buildDutySwapCardPayload(request);

  await prisma.chatMessage.update({
    where: { id: request.chatMessageId },
    data: { payload: payload as object },
  });

  const row = await prisma.chatMessage.findUniqueOrThrow({
    where: { id: request.chatMessageId },
    include: messageInclude,
  });

  const dto = mapMessage(row, []);

  broadcastToRoom(request.chatRoomId, {
    type: 'message.updated',
    roomId: request.chatRoomId,
    message: dto,
  });
  await emitRoomUpdates(request.chatRoomId);
}
