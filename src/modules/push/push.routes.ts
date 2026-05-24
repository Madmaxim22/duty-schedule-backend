import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, type AuthRequest } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { AppError } from '../../lib/errors.js';
import {
  getVapidPublicKey,
  isPushEnabled,
  removeSubscription,
  saveSubscription,
} from './push.service.js';
import { pushSubscriptionSchema, unsubscribeSchema } from './push.schemas.js';

const subscribeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Слишком много попыток подписки, попробуйте позже' },
});

export const pushRouter = Router();

pushRouter.get('/vapid-public-key', (_req, res) => {
  if (!isPushEnabled()) {
    res.status(503).json({ message: 'Push-уведомления не настроены на сервере' });
    return;
  }
  res.json({ publicKey: getVapidPublicKey() });
});

pushRouter.post(
  '/subscribe',
  subscribeLimiter,
  authenticate,
  requireRole('admin'),
  async (req: AuthRequest, res, next) => {
    try {
      if (!isPushEnabled()) {
        throw new AppError(503, 'Push-уведомления не настроены на сервере');
      }
      const body = pushSubscriptionSchema.parse(req.body);
      await saveSubscription(req.user!.sub, body);
      res.status(201).json({ message: 'Подписка сохранена' });
    } catch (e) {
      next(e);
    }
  },
);

pushRouter.delete(
  '/subscribe',
  authenticate,
  requireRole('admin'),
  async (req: AuthRequest, res, next) => {
    try {
      const body = unsubscribeSchema.parse(req.body);
      await removeSubscription(req.user!.sub, body.endpoint);
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  },
);
