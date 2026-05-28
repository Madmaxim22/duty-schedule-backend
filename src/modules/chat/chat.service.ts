import type { ChatRoomType, UserRole } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import {
  dispatchNotification,
  notifyChatMessage,
} from '../notifications/notifications.dispatch.js';
import { broadcastToRoom, broadcastToUser } from '../../ws/chat-ws.server.js';
import type {
  ChatMessageDto,
  ChatMessageReplyToDto,
  ChatReactionSummaryDto,
  ChatRoomListItemDto,
} from '../../ws/chat-ws.types.js';
import { compareReactionEmojis } from './chat-reactions.constants.js';
import { userAvatarMiniSelect, userAvatarPublicSelect } from '../../lib/user-avatar-select.js';

const authorSelect = {
  ...userAvatarPublicSelect,
  role: true,
} as const;

const contactSelect = userAvatarPublicSelect;

const REPLY_BODY_MAX = 120;

const replyToSelect = {
  id: true,
  body: true,
  author: { select: { id: true, fullName: true } },
} as const;

const messageInclude = {
  author: { select: authorSelect },
  replyTo: { select: replyToSelect },
} as const;

function directKeyIds(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function truncateReplyBody(body: string, max = REPLY_BODY_MAX): string {
  if (body.length <= max) return body;
  return `${body.slice(0, max - 1)}…`;
}

function mapReplyTo(
  replyTo: {
    id: string;
    body: string;
    author: { id: string; fullName: string };
  } | null | undefined,
): ChatMessageReplyToDto | undefined {
  if (!replyTo) return undefined;
  return {
    id: replyTo.id,
    body: truncateReplyBody(replyTo.body),
    author: { id: replyTo.author.id, fullName: replyTo.author.fullName },
  };
}

function mapMessage(row: {
  id: string;
  body: string;
  createdAt: Date;
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
    author: { id: string; fullName: string };
  } | null;
},
  reactions: ChatReactionSummaryDto[] = [],
  status?: 'sent' | 'delivered' | 'read',
): ChatMessageDto {
  const replyTo = mapReplyTo(row.replyTo);
  return {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    reactions,
    author: {
      id: row.author.id,
      fullName: row.author.fullName,
      avatarUrl: row.author.avatarUrl,
      currentPhotoId: row.author.currentPhotoId,
      avatarFocusX: row.author.avatarFocusX,
      avatarFocusY: row.author.avatarFocusY,
      role: row.author.role,
    },
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
    select: { id: true, roomId: true },
  });
  if (!message || message.roomId !== roomId) {
    throw new AppError(404, 'Сообщение не найдено');
  }
  return message;
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
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { body: true, createdAt: true, replyToMessageId: true },
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
    lastMessagePreview: last
      ? last.replyToMessageId
        ? `↩ ${truncateReplyBody(last.body)}`
        : last.body
      : null,
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
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { body: true, createdAt: true, replyToMessageId: true },
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
      lastMessagePreview: last
      ? last.replyToMessageId
        ? `↩ ${truncateReplyBody(last.body)}`
        : last.body
      : null,
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

export async function postMessage(
  roomId: string,
  authorId: string,
  body: string,
  replyToMessageId?: string,
) {
  await assertMember(roomId, authorId);
  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: { type: true },
  });
  if (!room) {
    throw new AppError(404, 'Чат не найден');
  }

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
      include: messageInclude,
    });

    await tx.chatRoom.update({
      where: { id: roomId },
      data: { updatedAt: new Date() },
    });

    await tx.chatMember.update({
      where: { roomId_userId: { roomId, userId: authorId } },
      data: { lastReadAt: new Date() },
    });

    return created;
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
    }),
  );

  return { message: dto };
}
