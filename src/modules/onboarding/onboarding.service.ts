import { prisma } from '../../lib/prisma.js';
import { appReleaseId } from '../../lib/app-version.js';
import {
  evaluateAchievementIds,
  getAchievementDefinition,
  type MonthDutyStats,
} from './achievements.config.js';
import {
  formatPeriod,
  getMoscowParts,
  periodBounds,
  periodLabel,
} from './moscow-date.js';
import { REVEAL_GRACE_DAYS, REVEAL_LAST_DAYS } from './onboarding.config.js';
import { CURRENT_RELEASE_ID, getCurrentRelease, RELEASES, type ReleaseNotes } from './releases.config.js';

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function resolveAchievementWindow(now: Date = new Date()): {
  inWindow: boolean;
  targetPeriod: string | null;
} {
  const { year, month, day, daysInMonth } = getMoscowParts(now);

  if (day > daysInMonth - REVEAL_LAST_DAYS) {
    return { inWindow: true, targetPeriod: formatPeriod(year, month) };
  }

  if (day <= REVEAL_GRACE_DAYS) {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    return { inWindow: true, targetPeriod: formatPeriod(prevYear, prevMonth) };
  }

  return { inWindow: false, targetPeriod: null };
}

export async function getMaxDutyStreakInPeriod(
  userId: string,
  period: string,
): Promise<number> {
  const { start, end } = periodBounds(period);
  const rows = await prisma.dutyAssignment.findMany({
    where: {
      userId,
      dutyDate: { gte: start, lte: end },
    },
    select: { dutyDate: true },
    distinct: ['dutyDate'],
    orderBy: { dutyDate: 'asc' },
  });

  if (rows.length === 0) return 0;

  const dates = rows.map((r) => formatDate(r.dutyDate));
  let maxStreak = 1;
  let current = 1;

  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(`${dates[i - 1]}T12:00:00Z`);
    const cur = new Date(`${dates[i]}T12:00:00Z`);
    const diffDays = Math.round((cur.getTime() - prev.getTime()) / 86_400_000);
    if (diffDays === 1) {
      current += 1;
      maxStreak = Math.max(maxStreak, current);
    } else {
      current = 1;
    }
  }

  return maxStreak;
}

export async function getDutyStatsForMonth(
  userId: string,
  period: string,
): Promise<MonthDutyStats> {
  const { start, end } = periodBounds(period);
  const dutyCount = await prisma.dutyAssignment.count({
    where: {
      userId,
      dutyDate: { gte: start, lte: end },
    },
  });
  const maxStreak = await getMaxDutyStreakInPeriod(userId, period);
  return { dutyCount, maxStreak };
}

export async function syncUserAchievementsForPeriod(
  userId: string,
  period: string,
): Promise<void> {
  const stats = await getDutyStatsForMonth(userId, period);
  const toUnlock = evaluateAchievementIds(stats);

  for (const achievementId of toUnlock) {
    await prisma.userAchievement.upsert({
      where: {
        userId_achievementId_period: { userId, achievementId, period },
      },
      create: { userId, achievementId, period },
      update: {},
    });
  }
}

async function hasReleaseAck(userId: string, releaseId: string): Promise<boolean> {
  const row = await prisma.userReleaseAck.findUnique({
    where: { userId_releaseId: { userId, releaseId } },
  });
  return Boolean(row);
}

export async function acknowledgeRelease(userId: string, releaseId: string): Promise<void> {
  const release = RELEASES[releaseId];
  if (!release) {
    throw new Error('Неизвестный релиз');
  }
  await prisma.userReleaseAck.upsert({
    where: { userId_releaseId: { userId, releaseId } },
    create: { userId, releaseId },
    update: {},
  });
}

export async function markAchievementsSeen(
  userId: string,
  period: string,
  achievementIds?: string[],
): Promise<void> {
  const where = {
    userId,
    period,
    seenAt: null,
    ...(achievementIds?.length ? { achievementId: { in: achievementIds } } : {}),
  };
  await prisma.userAchievement.updateMany({
    where,
    data: { seenAt: new Date() },
  });
}

function mapAchievementRow(
  row: { achievementId: string; unlockedAt: Date; seenAt: Date | null },
) {
  const def = getAchievementDefinition(row.achievementId);
  return {
    id: row.achievementId,
    title: def?.title ?? row.achievementId,
    description: def?.description ?? '',
    icon: def?.icon ?? '✓',
    unlockedAt: row.unlockedAt.toISOString(),
    isUnseen: row.seenAt === null,
  };
}

export function listReleases() {
  const currentId = CURRENT_RELEASE_ID;
  const releases = Object.values(RELEASES)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .map((r) => ({
      ...r,
      isCurrent: r.id === currentId,
    }));
  return { currentReleaseId: currentId, releases };
}

export function getReleasePayload(release: ReleaseNotes, needsAck: boolean) {
  return {
    id: release.id,
    version: release.version,
    title: release.title,
    publishedAt: release.publishedAt,
    items: release.items,
    needsAck,
  };
}

export async function getOnboardingState(userId: string) {
  const current = getCurrentRelease();
  let release: ReturnType<typeof getReleasePayload> | null = null;

  if (current) {
    const needsAck = !(await hasReleaseAck(userId, current.id));
    release = getReleasePayload(current, needsAck);
  }

  const window = resolveAchievementWindow();
  let achievements: {
    period: string;
    periodLabel: string;
    unseen: ReturnType<typeof mapAchievementRow>[];
    all: ReturnType<typeof mapAchievementRow>[];
  } | null = null;

  if (window.inWindow && window.targetPeriod) {
    await syncUserAchievementsForPeriod(userId, window.targetPeriod);
    const rows = await prisma.userAchievement.findMany({
      where: { userId, period: window.targetPeriod },
      orderBy: { unlockedAt: 'asc' },
    });
    const mapped = rows.map(mapAchievementRow);
    achievements = {
      period: window.targetPeriod,
      periodLabel: periodLabel(window.targetPeriod),
      unseen: mapped.filter((a) => a.isUnseen),
      all: mapped,
    };
  }

  return { release, achievements };
}
