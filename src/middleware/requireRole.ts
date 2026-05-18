import type { NextFunction, Response } from 'express';
import type { UserRole } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import type { AuthRequest } from './auth.js';

export function requireRole(...roles: UserRole[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new AppError(403, 'Недостаточно прав'));
      return;
    }
    next();
  };
}
