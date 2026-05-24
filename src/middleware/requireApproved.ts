import type { NextFunction, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import type { AuthRequest } from './auth.js';

export async function requireApproved(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user) {
    next(new AppError(401, 'Требуется авторизация'));
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.sub },
    select: { status: true },
  });

  if (!user || user.status !== 'approved') {
    next(new AppError(403, 'Доступ только для подтверждённых пользователей'));
    return;
  }

  next();
}
