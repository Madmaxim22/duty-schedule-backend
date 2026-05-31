import { prisma } from '../../lib/prisma.js';

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { start, end };
}

function daysInMonth(year: number, month: number): string[] {
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const days: string[] = [];
  for (let d = 1; d <= count; d += 1) {
    days.push(formatDate(new Date(Date.UTC(year, month - 1, d))));
  }
  return days;
}

function wauWindow(year: number, month: number) {
  const { end: monthEnd } = monthRange(year, month);
  const now = new Date();
  const end =
    now.getUTCFullYear() === year && now.getUTCMonth() + 1 === month
      ? now
      : monthEnd;
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  start.setUTCHours(0, 0, 0, 0);
  return { start, end };
}

type DayCountRow = { day: Date; count: bigint };
type DayUserRow = { day: Date; user_id: string };
type DayUserCountRow = { day: Date; user_id: string; count: bigint };

function mapDayUserCounts(rows: DayUserCountRow[]): Map<string, Map<string, number>> {
  const map = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const day = formatDate(row.day);
    const byUser = map.get(day) ?? new Map<string, number>();
    byUser.set(row.user_id, Number(row.count));
    map.set(day, byUser);
  }
  return map;
}

function pickLoginUsersByDay(
  authByDay: Map<string, Map<string, number>>,
  refreshByDay: Map<string, Map<string, number>>,
  loginCountsByDay: Map<string, number>,
  hasAuthEvents: boolean,
  dayList: string[],
): Map<string, Map<string, number>> {
  if (!hasAuthEvents) {
    return refreshByDay;
  }
  const result = new Map<string, Map<string, number>>();
  for (const day of dayList) {
    const authUsers = authByDay.get(day);
    const authTotal = loginCountsByDay.get(day) ?? 0;
    if (authTotal > 0 && authUsers) {
      result.set(day, authUsers);
    } else {
      result.set(day, refreshByDay.get(day) ?? new Map());
    }
  }
  return result;
}

function formatParticipants(
  userCounts: Map<string, number> | undefined,
  nameById: Map<string, string>,
): Array<{ name: string; count: number }> {
  if (!userCounts || userCounts.size === 0) return [];
  return [...userCounts.entries()]
    .map(([id, count]) => ({
      name: nameById.get(id) ?? 'Неизвестный',
      count,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

function formatActiveParticipants(
  ids: Set<string> | undefined,
  nameById: Map<string, string>,
): Array<{ name: string; count: number }> {
  if (!ids || ids.size === 0) return [];
  return [...ids]
    .map((id) => ({
      name: nameById.get(id) ?? 'Неизвестный',
      count: 1,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

function mapDayCounts(rows: DayCountRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(formatDate(row.day), Number(row.count));
  }
  return map;
}

function mapDayUserSets(rows: DayUserRow[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = formatDate(row.day);
    const set = map.get(key) ?? new Set<string>();
    set.add(row.user_id);
    map.set(key, set);
  }
  return map;
}

function mergeActiveUsers(
  ...maps: Map<string, Set<string>>[]
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const map of maps) {
    for (const [day, users] of map) {
      const set = result.get(day) ?? new Set<string>();
      for (const id of users) set.add(id);
      result.set(day, set);
    }
  }
  return result;
}

function pickLoginCounts(
  authByDay: Map<string, number>,
  refreshByDay: Map<string, number>,
  hasAuthEvents: boolean,
): Map<string, number> {
  if (!hasAuthEvents) {
    return refreshByDay;
  }
  const result = new Map<string, number>();
  const allDays = new Set([...authByDay.keys(), ...refreshByDay.keys()]);
  for (const day of allDays) {
    const auth = authByDay.get(day) ?? 0;
    result.set(day, auth > 0 ? auth : (refreshByDay.get(day) ?? 0));
  }
  return result;
}

function sumMap(map: Map<string, number>): number {
  let total = 0;
  for (const v of map.values()) total += v;
  return total;
}

function countDistinctUsersInRange(
  activeByDay: Map<string, Set<string>>,
  days: string[],
): number {
  const users = new Set<string>();
  for (const day of days) {
    for (const id of activeByDay.get(day) ?? []) users.add(id);
  }
  return users.size;
}

export async function getAdminActivityStatistics(year: number, month: number) {
  const { start, end } = monthRange(year, month);
  const dayList = daysInMonth(year, month);
  const wau = wauWindow(year, month);

  const [
    approvedUsers,
    authEventCount,
    authLoginsByDay,
    refreshLoginsByDay,
    registrationsMonth,
    chatMessagesByDay,
    chatAuthorsByDay,
    chatMessagesByDayUser,
    lastActiveByDay,
    authLoginsByDayUser,
    refreshLoginsByDayUser,
    authLoginsByUser,
    refreshLoginsByUser,
    chatMessagesByUser,
    chatAttachmentsByUser,
    chatMessagesMonth,
    chatAttachmentsMonth,
    chatReactionsMonth,
    roomsTotal,
    roomsDirect,
    roomsGroup,
    topRooms,
    wauActiveUsers,
  ] = await Promise.all([
    prisma.user.findMany({
      where: { status: 'approved' },
      select: { id: true, fullName: true, lastActiveAt: true, createdAt: true },
      orderBy: { fullName: 'asc' },
    }),
    prisma.authEvent.count({ where: { type: 'login' } }),
    prisma.$queryRaw<DayCountRow[]>`
      SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::bigint AS count
      FROM auth_events
      WHERE type = 'login'::"AuthEventType"
        AND created_at >= ${start} AND created_at <= ${end}
      GROUP BY 1
    `,
    prisma.$queryRaw<DayCountRow[]>`
      SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::bigint AS count
      FROM refresh_tokens
      WHERE created_at >= ${start} AND created_at <= ${end}
      GROUP BY 1
    `,
    prisma.user.count({
      where: { createdAt: { gte: start, lte: end } },
    }),
    prisma.$queryRaw<DayCountRow[]>`
      SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::bigint AS count
      FROM chat_messages
      WHERE deleted_at IS NULL
        AND created_at >= ${start} AND created_at <= ${end}
      GROUP BY 1
    `,
    prisma.$queryRaw<DayUserRow[]>`
      SELECT date_trunc('day', created_at)::date AS day, author_id AS user_id
      FROM chat_messages
      WHERE deleted_at IS NULL
        AND created_at >= ${start} AND created_at <= ${end}
    `,
    prisma.$queryRaw<DayUserCountRow[]>`
      SELECT date_trunc('day', created_at)::date AS day, author_id AS user_id, COUNT(*)::bigint AS count
      FROM chat_messages
      WHERE deleted_at IS NULL
        AND created_at >= ${start} AND created_at <= ${end}
      GROUP BY 1, 2
    `,
    prisma.$queryRaw<DayUserRow[]>`
      SELECT date_trunc('day', last_active_at)::date AS day, id AS user_id
      FROM users
      WHERE last_active_at IS NOT NULL
        AND last_active_at >= ${start} AND last_active_at <= ${end}
    `,
    prisma.$queryRaw<DayUserCountRow[]>`
      SELECT date_trunc('day', created_at)::date AS day, user_id, COUNT(*)::bigint AS count
      FROM auth_events
      WHERE type = 'login'::"AuthEventType"
        AND user_id IS NOT NULL
        AND created_at >= ${start} AND created_at <= ${end}
      GROUP BY 1, 2
    `,
    prisma.$queryRaw<DayUserCountRow[]>`
      SELECT date_trunc('day', created_at)::date AS day, user_id, COUNT(*)::bigint AS count
      FROM refresh_tokens
      WHERE created_at >= ${start} AND created_at <= ${end}
      GROUP BY 1, 2
    `,
    prisma.$queryRaw<Array<{ user_id: string; count: bigint }>>`
      SELECT user_id, COUNT(*)::bigint AS count
      FROM auth_events
      WHERE type = 'login'::"AuthEventType"
        AND user_id IS NOT NULL
        AND created_at >= ${start} AND created_at <= ${end}
      GROUP BY user_id
    `,
    prisma.$queryRaw<Array<{ user_id: string; count: bigint }>>`
      SELECT user_id, COUNT(*)::bigint AS count
      FROM refresh_tokens
      WHERE created_at >= ${start} AND created_at <= ${end}
      GROUP BY user_id
    `,
    prisma.$queryRaw<Array<{ user_id: string; count: bigint }>>`
      SELECT author_id AS user_id, COUNT(*)::bigint AS count
      FROM chat_messages
      WHERE deleted_at IS NULL
        AND created_at >= ${start} AND created_at <= ${end}
      GROUP BY author_id
    `,
    prisma.$queryRaw<Array<{ user_id: string; count: bigint }>>`
      SELECT uploader_id AS user_id, COUNT(*)::bigint AS count
      FROM chat_message_attachments
      WHERE created_at >= ${start} AND created_at <= ${end}
      GROUP BY uploader_id
    `,
    prisma.chatMessage.count({
      where: { deletedAt: null, createdAt: { gte: start, lte: end } },
    }),
    prisma.chatMessageAttachment.count({
      where: { createdAt: { gte: start, lte: end } },
    }),
    prisma.chatMessageReaction.count({
      where: { createdAt: { gte: start, lte: end } },
    }),
    prisma.chatRoom.count(),
    prisma.chatRoom.count({ where: { type: 'direct' } }),
    prisma.chatRoom.count({ where: { type: 'group' } }),
    prisma.$queryRaw<
      Array<{ room_id: string; title: string | null; type: string; count: bigint }>
    >`
      SELECT m.room_id, r.title, r.type::text, COUNT(*)::bigint AS count
      FROM chat_messages m
      JOIN chat_rooms r ON r.id = m.room_id
      WHERE m.deleted_at IS NULL
        AND m.created_at >= ${start} AND m.created_at <= ${end}
      GROUP BY m.room_id, r.title, r.type
      ORDER BY count DESC
      LIMIT 5
    `,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT user_id)::bigint AS count FROM (
        SELECT id AS user_id FROM users
        WHERE last_active_at >= ${wau.start} AND last_active_at <= ${wau.end}
        UNION
        SELECT user_id FROM auth_events
        WHERE type = 'login'::"AuthEventType" AND user_id IS NOT NULL
          AND created_at >= ${wau.start} AND created_at <= ${wau.end}
        UNION
        SELECT user_id FROM refresh_tokens
        WHERE created_at >= ${wau.start} AND created_at <= ${wau.end}
        UNION
        SELECT author_id AS user_id FROM chat_messages
        WHERE deleted_at IS NULL
          AND created_at >= ${wau.start} AND created_at <= ${wau.end}
      ) active
    `,
  ]);

  const authLoginDayMap = mapDayCounts(authLoginsByDay);
  const refreshLoginDayMap = mapDayCounts(refreshLoginsByDay);
  const loginByDay = pickLoginCounts(
    authLoginDayMap,
    refreshLoginDayMap,
    authEventCount > 0,
  );

  const chatMsgDayMap = mapDayCounts(chatMessagesByDay);
  const chatByDayUser = mapDayUserCounts(chatMessagesByDayUser);
  const authLoginByDayUser = mapDayUserCounts(authLoginsByDayUser);
  const refreshLoginByDayUser = mapDayUserCounts(refreshLoginsByDayUser);
  const activeFromChat = mapDayUserSets(chatAuthorsByDay);
  const activeFromLastActive = mapDayUserSets(lastActiveByDay);

  const authLoginUsers = new Map(
    authLoginsByUser.map((r) => [r.user_id, Number(r.count)]),
  );
  const refreshLoginUsers = new Map(
    refreshLoginsByUser.map((r) => [r.user_id, Number(r.count)]),
  );
  const chatMsgUsers = new Map(
    chatMessagesByUser.map((r) => [r.user_id, Number(r.count)]),
  );
  const chatAttachUsers = new Map(
    chatAttachmentsByUser.map((r) => [r.user_id, Number(r.count)]),
  );

  const loginUsersByDay = await prisma.$queryRaw<DayUserRow[]>`
    SELECT date_trunc('day', created_at)::date AS day, user_id
    FROM auth_events
    WHERE type = 'login'::"AuthEventType"
      AND user_id IS NOT NULL
      AND created_at >= ${start} AND created_at <= ${end}
  `;
  const refreshUsersByDay = await prisma.$queryRaw<DayUserRow[]>`
    SELECT date_trunc('day', created_at)::date AS day, user_id
    FROM refresh_tokens
    WHERE created_at >= ${start} AND created_at <= ${end}
  `;

  const nameById = new Map(approvedUsers.map((u) => [u.id, u.fullName]));

  const activeFromAuthLogins = mapDayUserSets(loginUsersByDay);
  const activeFromRefresh = mapDayUserSets(refreshUsersByDay);
  const activeLoginByDay = mergeActiveUsers(activeFromAuthLogins, activeFromRefresh);

  const loginUsersByDayMap = pickLoginUsersByDay(
    authLoginByDayUser,
    refreshLoginByDayUser,
    loginByDay,
    authEventCount > 0,
    dayList,
  );

  const activeByDay = mergeActiveUsers(
    activeFromLastActive,
    activeLoginByDay,
    activeFromChat,
  );

  const activeUsersMonth = countDistinctUsersInRange(activeByDay, dayList);
  const loginsMonth = sumMap(loginByDay);

  const daily = dayList.map((date) => ({
    date,
    activeUsers: activeByDay.get(date)?.size ?? 0,
    activeParticipants: formatActiveParticipants(activeByDay.get(date), nameById),
    logins: loginByDay.get(date) ?? 0,
    loginParticipants: formatParticipants(loginUsersByDayMap.get(date), nameById),
    chatMessages: chatMsgDayMap.get(date) ?? 0,
    chatParticipants: formatParticipants(chatByDayUser.get(date), nameById),
  }));

  const todayKey = formatDate(new Date());
  const dauToday = activeByDay.get(todayKey)?.size ?? 0;

  const activeDaysWithUsers = daily.filter((d) => d.activeUsers > 0);
  const dauMonthAvg =
    activeDaysWithUsers.length > 0
      ? activeDaysWithUsers.reduce((s, d) => s + d.activeUsers, 0) /
        activeDaysWithUsers.length
      : 0;

  return {
    year,
    month,
    trackingNote:
      authEventCount > 0
        ? 'Входы и активность учитываются с момента последнего обновления.'
        : 'Входы за прошлые периоды оценены по сессиям (refresh_tokens).',
    summary: {
      approvedUsers: approvedUsers.length,
      registrations: registrationsMonth,
      logins: loginsMonth,
      chatMessages: chatMessagesMonth,
      chatAttachments: chatAttachmentsMonth,
      chatReactions: chatReactionsMonth,
      activeUsersMonth,
      dauToday,
      dauMonthAvg: Math.round(dauMonthAvg * 10) / 10,
      wau: Number(wauActiveUsers[0]?.count ?? 0),
      roomsTotal,
      roomsDirect,
      roomsGroup,
      topRooms: topRooms.map((r) => ({
        roomId: r.room_id,
        title: r.title,
        type: r.type,
        messages: Number(r.count),
      })),
    },
    daily,
    users: approvedUsers.map((user) => {
      const authLogins = authLoginUsers.get(user.id) ?? 0;
      const refreshLogins = refreshLoginUsers.get(user.id) ?? 0;
      const loginsMonthForUser =
        authEventCount > 0
          ? authLogins > 0
            ? authLogins
            : refreshLogins
          : refreshLogins;

      return {
        id: user.id,
        fullName: user.fullName,
        lastActiveAt: user.lastActiveAt?.toISOString() ?? null,
        loginsMonth: loginsMonthForUser,
        chatMessagesMonth: chatMsgUsers.get(user.id) ?? 0,
        chatAttachmentsMonth: chatAttachUsers.get(user.id) ?? 0,
      };
    }),
  };
}
