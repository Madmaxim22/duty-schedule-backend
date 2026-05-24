import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, type AuthRequest } from '../../middleware/auth.js';
import { requireApproved } from '../../middleware/requireApproved.js';
import { requireRole } from '../../middleware/requireRole.js';
import {
  adminThreadsQuerySchema,
  closeThreadSchema,
  createThreadSchema,
  messageBodySchema,
  threadIdParamSchema,
} from './support.schemas.js';
import {
  closeThread,
  createThread,
  getThread,
  listAdminThreads,
  listMyThreads,
  postMessage,
} from './support.service.js';

const postLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => (req as AuthRequest).user?.sub ?? req.ip ?? 'unknown',
  message: { message: 'Слишком много сообщений, попробуйте позже' },
});

export const supportRouter = Router();

supportRouter.use(authenticate, requireApproved);

supportRouter.post('/threads', postLimiter, async (req: AuthRequest, res, next) => {
  try {
    const body = createThreadSchema.parse(req.body);
    const data = await createThread(req.user!.sub, body.body);
    res.status(201).json(data);
  } catch (e) {
    next(e);
  }
});

supportRouter.get('/threads', async (req: AuthRequest, res, next) => {
  try {
    const data = await listMyThreads(req.user!.sub);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

supportRouter.get('/threads/:id', async (req: AuthRequest, res, next) => {
  try {
    const id = threadIdParamSchema.parse(req.params.id);
    const data = await getThread(id, req.user!.sub, req.user!.role);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

supportRouter.post(
  '/threads/:id/messages',
  postLimiter,
  async (req: AuthRequest, res, next) => {
    try {
      const id = threadIdParamSchema.parse(req.params.id);
      const body = messageBodySchema.parse(req.body);
      const data = await postMessage(id, req.user!.sub, req.user!.role, body.body);
      res.status(201).json(data);
    } catch (e) {
      next(e);
    }
  },
);

export const adminSupportRouter = Router();

adminSupportRouter.use(authenticate, requireRole('admin'));

adminSupportRouter.get('/threads', async (req, res, next) => {
  try {
    const query = adminThreadsQuerySchema.parse(req.query);
    const data = await listAdminThreads(query.status);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

adminSupportRouter.get('/threads/:id', async (req: AuthRequest, res, next) => {
  try {
    const id = threadIdParamSchema.parse(req.params.id);
    const data = await getThread(id, req.user!.sub, req.user!.role);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

adminSupportRouter.post(
  '/threads/:id/messages',
  postLimiter,
  async (req: AuthRequest, res, next) => {
    try {
      const id = threadIdParamSchema.parse(req.params.id);
      const body = messageBodySchema.parse(req.body);
      const data = await postMessage(id, req.user!.sub, req.user!.role, body.body);
      res.status(201).json(data);
    } catch (e) {
      next(e);
    }
  },
);

adminSupportRouter.patch('/threads/:id', async (req, res, next) => {
  try {
    const id = threadIdParamSchema.parse(req.params.id);
    closeThreadSchema.parse(req.body);
    const data = await closeThread(id);
    res.json(data);
  } catch (e) {
    next(e);
  }
});
