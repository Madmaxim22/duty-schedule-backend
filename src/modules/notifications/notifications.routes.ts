import { Router } from 'express';
import { authenticate, type AuthRequest } from '../../middleware/auth.js';
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from './notifications.service.js';
import { notificationsQuerySchema } from './notifications.schemas.js';

export const notificationsRouter = Router();

notificationsRouter.use(authenticate);

notificationsRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const query = notificationsQuerySchema.parse(req.query);
    const data = await listNotifications(req.user!.sub, query.limit, query.cursor);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

notificationsRouter.get('/unread-count', async (req: AuthRequest, res, next) => {
  try {
    const data = await getUnreadCount(req.user!.sub);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

notificationsRouter.patch('/read-all', async (req: AuthRequest, res, next) => {
  try {
    await markAllNotificationsRead(req.user!.sub);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

notificationsRouter.patch('/:id/read', async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    await markNotificationRead(req.user!.sub, id);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});
