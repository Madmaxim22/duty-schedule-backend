import { Router } from 'express';
import { z } from 'zod';
import { authenticate, type AuthRequest } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import {
  listAllUsers,
  listApprovedUsers,
  listApprovedUsersForDate,
  listPendingUsers,
  updateUserStatus,
  updateUserRole,
  deleteUser,
} from './users.service.js';
import { dateParamSchema } from '../schedule/schedule.schemas.js';

export const usersRouter = Router();

usersRouter.use(authenticate, requireRole('admin'));

usersRouter.get('/', async (_req, res, next) => {
  try {
    const users = await listAllUsers();
    res.json({ users });
  } catch (e) {
    next(e);
  }
});

usersRouter.get('/pending', async (_req, res, next) => {
  try {
    const users = await listPendingUsers();
    res.json({ users });
  } catch (e) {
    next(e);
  }
});

usersRouter.patch('/:id', async (req: AuthRequest, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        action: z.enum(['approve', 'reject', 'promote', 'demote']),
      })
      .parse(req.body);

    const user =
      body.action === 'promote' || body.action === 'demote'
        ? await updateUserRole(id, body.action, req.user!.sub)
        : await updateUserStatus(id, body.action);

    res.json({ user });
  } catch (e) {
    next(e);
  }
});

usersRouter.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    await deleteUser(id, req.user!.sub);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

export const approvedUsersRouter = Router();

approvedUsersRouter.get(
  '/',
  authenticate,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const date =
        typeof req.query.date === 'string'
          ? dateParamSchema.parse(req.query.date)
          : undefined;
      const users = date
        ? await listApprovedUsersForDate(date)
        : await listApprovedUsers();
      res.json({ users });
    } catch (e) {
      next(e);
    }
  },
);
