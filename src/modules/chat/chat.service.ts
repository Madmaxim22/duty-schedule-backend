import type { ChatRoomType, UserRole } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import {
  dispatchNotification,
  notifyChatMessage,
} from '../notifications/notifications.dispatch.js';
import { broadcastToRoom, broadcastToUser } from '../../ws/chat-ws.server.js';
import type { ChatMessageDto, ChatRoomListItemDto } from '../../ws/chat-ws.types.js';

const authorSelect = {
  id: true,
  fullName: true,
  avatarUrl: true,
  currentPhotoId: true,
  role: true,
} as const;

const contactSelect = {
  id: true,
  fullName: true,
  avatarUrl: true,
  currentPhotoId: true,
} as const;

function directKeyIds(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
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
    role: UserRole;
  };
}): ChatMessageDto {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    author: {
      id: row.author.id,
      fullName: row.author.fullName,
      avatarUrl: row.author.avatarUrl,
      currentPhotoId: row.author.currentPhotoId,
      role: row.author.role,
    },
  };
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
      user: { id: string; fullName: string; avatarUrl: string | null };
    }>;
  },
  viewerId: string,
): { displayName: string; displayAvatarUrl: string | null } {
  if (room.type === 'group') {
    return {
      displayName: room.title ?? 'Группа',
      displayAvatarUrl: null,
    };
  }
  const peer = room.members.find((m) => m.userId !== viewerId);
  return {
    displayName: peer?.user.fullName ?? 'Чат',
    displayAvatarUrl: peer?.user.avatarUrl ?? null,
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
            select: { body: true, createdAt: true },
          },
          members: {
            include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
          },
        },
      },
    },
  });
  if (!membership) return null;

  const { room } = membership;
  const last = room.messages[0];
  const { displayName, displayAvatarUrl } = resolveDisplay(room, userId);
  const unreadCount = await countUnread(roomId, userId, membership.lastReadAt);

  return {
    id: room.id,
    type: room.type,
    title: room.title,
    displayName,
    displayAvatarUrl,
    lastMessagePreview: last?.body ?? null,
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
    select: { id: true, fullName: true, avatarUrl: true, currentPhotoId: true },
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
            select: { body: true, createdAt: true },
          },
          members: {
            include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
          },
        },
      },
    },
    orderBy: { room: { updatedAt: 'desc' } },
  });

  const rooms: ChatRoomListItemDto[] = [];
  for (const m of memberships) {
    const last = m.room.messages[0];
    const { displayName, displayAvatarUrl } = resolveDisplay(m.room, userId);
    const unreadCount = await countUnread(m.roomId, userId, m.lastReadAt);
    rooms.push({
      id: m.room.id,
      type: m.room.type,
      title: m.room.title,
      displayName,
      displayAvatarUrl,
      lastMessagePreview: last?.body ?? null,
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
      user: {
        id: string;
        fullName: string;
        avatarUrl: string | null;
        currentPhotoId: string | null;
        role?: UserRole;
      };
    }>;
  },
  viewerId: string,
) {
  const { displayName, displayAvatarUrl } = resolveDisplay(
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
    createdAt: room.createdAt.toISOString(),
    updatedAt: room.updatedAt.toISOString(),
    members: room.members.map((m) => ({
      id: m.user.id,
      fullName: m.user.fullName,
      avatarUrl: m.user.avatarUrl,
      currentPhotoId: m.user.currentPhotoId,
      role: m.user.role,
    })),
  };
}

export async function getRoom(roomId: string, userId: string) {
  await assertMember(roomId, userId);

  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    include: {
      members: {
        include: { user: { select: { ...contactSelect, role: true } } },
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
    include: { author: { select: authorSelect } },
  });

  const messages = rows.reverse().map(mapMessage);
  const nextBefore = rows.length === limit ? rows[0]?.createdAt.toISOString() : null;

  return { messages, nextBefore };
}

export async function markRoomRead(roomId: string, userId: string) {
  await assertMember(roomId, userId);

  await prisma.chatMember.update({
    where: { roomId_userId: { roomId, userId } },
    data: { lastReadAt: new Date() },
  });

  return { ok: true };
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

export async function postMessage(roomId: string, authorId: string, body: string) {
  await assertMember(roomId, authorId);

  const author = await prisma.user.findUnique({
    where: { id: authorId },
    select: { id: true, fullName: true, role: true },
  });
  if (!author) {
    throw new AppError(404, 'Пользователь не найден');
  }

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.chatMessage.create({
      data: { roomId, authorId, body },
      include: { author: { select: authorSelect } },
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

  const dto = mapMessage(message);

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
