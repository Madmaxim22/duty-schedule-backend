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
    description: 'От 3 до 6 дежурств за месяц',
    icon: '⭐',
  },
  {
    id: 'month_duty_5',
    title: 'Герой графика',
    description: 'Семь и более дежурств за месяц',
    icon: '🏆',
  },
  {
    id: 'month_sick_support',
    title: 'Главное — здоровье',
    description:
      'Вы были на больничном. Берегите себя, отдыхайте — график подождёт. Желаем скорейшего восстановления!',
    icon: '💚',
  },
];

export function isSickLeaveAbsence(absenceType: string): boolean {
  return /больнич/i.test(absenceType);
}

const DEFINITIONS_BY_ID = new Map(
  ACHIEVEMENT_DEFINITIONS.map((d) => [d.id, d]),
);

export function getAchievementDefinition(id: string): AchievementDefinition | undefined {
  return DEFINITIONS_BY_ID.get(id);
}

export type MonthDutyStats = {
  dutyCount: number;
  sickLeaveDays: number;
};

export function evaluateAchievementIds(stats: MonthDutyStats): string[] {
  const unlocked: string[] = [];
  if (stats.dutyCount >= 1) unlocked.push('month_first_duty');
  if (stats.dutyCount >= 3 && stats.dutyCount <= 6) unlocked.push('month_duty_3');
  if (stats.dutyCount >= 7) unlocked.push('month_duty_5');
  if (stats.sickLeaveDays >= 1) unlocked.push('month_sick_support');
  return unlocked;
}
