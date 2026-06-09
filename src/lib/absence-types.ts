export const ABSENCE_TYPES = [
  'Отпуск',
  'Больничный',
  'Госпитализация',
  'Командировка',
  'Учёба',
] as const;

export type AbsenceTypePreset = (typeof ABSENCE_TYPES)[number];
