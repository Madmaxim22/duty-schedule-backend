export type AchievementDefinition = {
  id: string;
  title: string;
  description: string;
  icon: string;
};

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  {
    id: 'month_first_duty',
    title: 'Первое дежурство',
    description: 'Хотя бы одно дежурство за месяц',
    icon: '🎯',
  },
  {
    id: 'month_duty_3',
    title: 'Надёжный дежурный',
    description: 'Три и более дежурств за месяц',
    icon: '⭐',
  },
  {
    id: 'month_duty_5',
    title: 'Герой графика',
    description: 'Пять и более дежурств за месяц',
    icon: '🏆',
  },
  {
    id: 'month_streak_3',
    title: 'Серия из трёх',
    description: 'Три дежурства подряд в календарные дни месяца',
    icon: '🔥',
  },
];

const DEFINITIONS_BY_ID = new Map(
  ACHIEVEMENT_DEFINITIONS.map((d) => [d.id, d]),
);

export function getAchievementDefinition(id: string): AchievementDefinition | undefined {
  return DEFINITIONS_BY_ID.get(id);
}

export type MonthDutyStats = {
  dutyCount: number;
  maxStreak: number;
};

export function evaluateAchievementIds(stats: MonthDutyStats): string[] {
  const unlocked: string[] = [];
  if (stats.dutyCount >= 1) unlocked.push('month_first_duty');
  if (stats.dutyCount >= 3) unlocked.push('month_duty_3');
  if (stats.dutyCount >= 5) unlocked.push('month_duty_5');
  if (stats.maxStreak >= 3) unlocked.push('month_streak_3');
  return unlocked;
}
