import { prisma } from '../../lib/prisma.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../lib/jwt.js';
import { AppError } from '../../lib/errors.js';
import { env } from '../../config/env.js';
import { toPublicUser } from '../../lib/public-user.js';
import { removeAvatarFile, saveAvatarFile } from '../../lib/avatar.js';

export async function registerUser(input: {
  email: string;
  password: string;
  fullName: string;
}) {
  const email = input.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError(409, 'Пользователь с таким email уже существует');
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(input.password),
      fullName: input.fullName.trim(),
      role: 'user',
      status: 'pending',
    },
  });

  return toPublicUser(user);
}

export async function loginUser(input: { email: string; password: string }) {
  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
  });

  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new AppError(401, 'Неверный email или пароль');
  }

  if (user.status === 'pending') {
    throw new AppError(403, 'Аккаунт ожидает подтверждения администратора');
  }

  if (user.status === 'rejected') {
    throw new AppError(403, 'Регистрация отклонена администратором');
  }

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    fullName: user.fullName,
  });

  const refreshToken = signRefreshToken(user.id);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + env.refreshTokenDays);

  await prisma.refreshToken.create({
    data: { token: refreshToken, userId: user.id, expiresAt },
  });

  return { accessToken, refreshToken, user: toPublicUser(user) };
}

export async function refreshSession(refreshToken: string) {
  let payload: { sub: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError(401, 'Недействительный refresh-токен');
  }

  const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
  if (!stored || stored.expiresAt < new Date()) {
    throw new AppError(401, 'Сессия истекла');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.status !== 'approved') {
    throw new AppError(401, 'Пользователь недоступен');
  }

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    fullName: user.fullName,
  });

  return { accessToken, user: toPublicUser(user) };
}

export async function logoutUser(refreshToken?: string) {
  if (!refreshToken) return;
  await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError(404, 'Пользователь не найден');
  }
  return toPublicUser(user);
}

export async function uploadUserAvatar(userId: string, buffer: Buffer) {
  const avatarUrl = await saveAvatarFile(userId, buffer);
  const user = await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl },
  });
  return toPublicUser(user);
}

export async function deleteUserAvatar(userId: string) {
  await removeAvatarFile(userId);
  const user = await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl: null },
  });
  return toPublicUser(user);
}

export async function seedAdminIfNeeded() {
  const email = env.adminEmail.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;

  return prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(env.adminPassword),
      fullName: env.adminFullName,
      role: 'admin',
      status: 'approved',
    },
  });
}
