/** Поля пользователя для отображения аватара с focal point. */
export const userAvatarPublicSelect = {
  id: true,
  fullName: true,
  avatarUrl: true,
  currentPhotoId: true,
  avatarFocusX: true,
  avatarFocusY: true,
} as const;

/** Компактный набор для списков (чат, реакции). */
export const userAvatarMiniSelect = {
  id: true,
  fullName: true,
  avatarUrl: true,
  avatarFocusX: true,
  avatarFocusY: true,
} as const;
