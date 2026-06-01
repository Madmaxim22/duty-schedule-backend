import { appReleaseId } from '../../lib/app-version.js';
import type { ReleaseNotes } from './releases.types.js';

export type { ReleaseNotes } from './releases.types.js';

export const RELEASES: Record<string, ReleaseNotes> = {
  '1.0.0': {
    id: '1.0.0',
    version: '1.0.0',
    title: 'Первая версия',
    publishedAt: '2026-05-17',
    items: [
      'Календарь дежурств и личный график',
      'Оповещения об изменениях графика',
      'Галерея фото профиля и лайки',
    ],
  },
  '1.1.0': {
    id: '1.1.0',
    version: '1.1.0',
    title: 'Чат и поддержка',
    publishedAt: '2026-05-28',
    items: [
      'Чаты между сотрудниками',
      'Обращения в техподдержку',
      'Push-уведомления в браузере',
    ],
  },
  '1.2.0': {
    id: '1.2.0',
    version: '1.2.0',
    title: 'Обмен дежурствами',
    publishedAt: '2026-06-01',
    items: [
      'Заявки на обмен дежурствами между сотрудниками',
      'Согласование обмена и уведомления в чате',
      'Раздел «Обновления» с историей версий',
    ],
  },
};

export const CURRENT_RELEASE_ID = appReleaseId;

export function getCurrentRelease(): ReleaseNotes | null {
  return RELEASES[CURRENT_RELEASE_ID] ?? null;
}
