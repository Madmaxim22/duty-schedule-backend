import type { UserRole } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import {
  dispatchNotification,
  notifyAdminsSupportMessage,
  notifyUserSupportReply,
} from '../notifications/notifications.dispatch.js';

const authorSelect = {
  id: true,
  fullName: true,
  avatarUrl: true,
  role: true,
} as const;

function mapMessage(row: {
  id: string;
  body: string;
  createdAt: Date;
  author: { id: string; fullName: string; avatarUrl: string | null; role: UserRole };
}) {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    author: {
      id: row.author.id,
      fullName: row.author.fullName,
      avatarUrl: row.author.avatarUrl,
      role: row.author.role,
    },
  };
}

function mapThreadSummary(
  thread: {
    id: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    author: { id: string; fullName: string; avatarUrl: string | null };
    messages: Array<{ body: string; createdAt: Date }>;
  },
) {
  const last = thread.messages[0];
  return {
    id: thread.id,
    status: thread.status,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
    author: {
      id: thread.author.id,
      fullName: thread.author.fullName,
      avatarUrl: thread.author.avatarUrl,
    },
    lastMessagePreview: last?.body ?? null,
    lastMessageAt: last?.createdAt.toISOString() ?? null,
  };
}

async function getThreadOrThrow(threadId: string) {
  const thread = await prisma.supportThread.findUnique({
    where: { id: threadId },
    include: {
      author: { select: authorSelect },
    },
  });
  if (!thread) {
    throw new AppError(404, 'Обращение не найдено');
  }
  return thread;
}

function assertCanAccessThread(
  thread: { authorId: string },
  userId: string,
  role: UserRole,
): void {
  if (role === 'admin') return;
  if (thread.authorId !== userId) {
    throw new AppError(403, 'Нет доступа к этому обращению');
  }
}

export async function createThread(authorId: string, body: string) {
  const author = await prisma.user.findUnique({
    where: { id: authorId },
    select: { id: true, fullName: true, role: true },
  });
  if (!author) {
    throw new AppError(404, 'Пользователь не найден');
  }

  const thread = await prisma.supportThread.create({
    data: {
      authorId,
      messages: {
        create: {
          authorId,
          body,
        },
      },
    },
    include: {
      author: { select: authorSelect },
      messages: {
        orderBy: { createdAt: 'asc' },
        include: { author: { select: authorSelect } },
      },
    },
  });

  dispatchNotification(() =>
    notifyAdminsSupportMessage({
      threadId: thread.id,
      authorId: author.id,
      authorFullName: author.fullName,
      body,
    }),
  );

  return {
    thread: {
      id: thread.id,
      status: thread.status,
      createdAt: thread.createdAt.toISOString(),
      updatedAt: thread.updatedAt.toISOString(),
      author: {
        id: thread.author.id,
        fullName: thread.author.fullName,
        avatarUrl: thread.author.avatarUrl,
      },
    },
    messages: thread.messages.map(mapMessage),
  };
}

export async function listMyThreads(authorId: string) {
  const threads = await prisma.supportThread.findMany({
    where: { authorId },
    orderBy: { updatedAt: 'desc' },
    include: {
      author: { select: { id: true, fullName: true, avatarUrl: true } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { body: true, createdAt: true },
      },
    },
  });

  return { threads: threads.map(mapThreadSummary) };
}

export async function listAdminThreads(status: 'open' | 'closed') {
  const threads = await prisma.supportThread.findMany({
    where: { status },
    orderBy: { updatedAt: 'desc' },
    include: {
      author: { select: { id: true, fullName: true, avatarUrl: true } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { body: true, createdAt: true },
      },
    },
  });

  return { threads: threads.map(mapThreadSummary) };
}

export async function getThread(
  threadId: string,
  userId: string,
  role: UserRole,
) {
  const thread = await getThreadOrThrow(threadId);
  assertCanAccessThread(thread, userId, role);

  const messages = await prisma.supportMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: 'asc' },
    include: { author: { select: authorSelect } },
  });

  return {
    thread: {
      id: thread.id,
      status: thread.status,
      createdAt: thread.createdAt.toISOString(),
      updatedAt: thread.updatedAt.toISOString(),
      author: {
        id: thread.author.id,
        fullName: thread.author.fullName,
        avatarUrl: thread.author.avatarUrl,
        role: thread.author.role,
      },
    },
    messages: messages.map(mapMessage),
  };
}

export async function postMessage(
  threadId: string,
  authorId: string,
  role: UserRole,
  body: string,
) {
  const thread = await getThreadOrThrow(threadId);
  assertCanAccessThread(thread, authorId, role);

  if (thread.status === 'closed') {
    throw new AppError(400, 'Обращение закрыто');
  }

  const author = await prisma.user.findUnique({
    where: { id: authorId },
    select: { id: true, fullName: true, role: true },
  });
  if (!author) {
    throw new AppError(404, 'Пользователь не найден');
  }

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.supportMessage.create({
      data: {
        threadId,
        authorId,
        body,
      },
      include: { author: { select: authorSelect } },
    });

    await tx.supportThread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });

    return created;
  });

  if (role === 'admin') {
    dispatchNotification(() =>
      notifyUserSupportReply({
        threadId,
        authorId: author.id,
        authorFullName: author.fullName,
        recipientId: thread.authorId,
        body,
      }),
    );
  } else {
    dispatchNotification(() =>
      notifyAdminsSupportMessage({
        threadId,
        authorId: author.id,
        authorFullName: author.fullName,
        body,
      }),
    );
  }

  return { message: mapMessage(message) };
}

export async function closeThread(threadId: string) {
  const thread = await getThreadOrThrow(threadId);

  if (thread.status === 'closed') {
    throw new AppError(400, 'Обращение уже закрыто');
  }

  const updated = await prisma.supportThread.update({
    where: { id: threadId },
    data: { status: 'closed' },
    include: {
      author: { select: { id: true, fullName: true, avatarUrl: true } },
    },
  });

  return {
    thread: {
      id: updated.id,
      status: updated.status,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      author: {
        id: updated.author.id,
        fullName: updated.author.fullName,
        avatarUrl: updated.author.avatarUrl,
      },
    },
  };
}
