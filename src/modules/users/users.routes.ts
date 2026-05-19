import { Router } from 'express';
import { z } from 'zod';
import { authenticate, type AuthRequest } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import {
  listAllUsers,
  listApprovedUsers,
  listPendingUsers,
  updateUserStatus,
} from './users.service.js';

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

usersRouter.patch('/:id', async (req, res, next) => {
  try {
    const body = z
      .object({ action: z.enum(['approve', 'reject']) })
      .parse(req.body);
    const user = await updateUserStatus(req.params.id, body.action);
    res.json({ user });
  } catch (e) {
    next(e);
  }
});

export const approvedUsersRouter = Router();

approvedUsersRouter.get(
  '/',
  authenticate,
  requireRole('admin'),
  async (_req, res, next) => {
    try {
      const users = await listApprovedUsers();
      res.json({ users });
    } catch (e) {
      next(e);
    }
  },
);
