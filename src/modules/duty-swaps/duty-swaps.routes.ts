import { Router } from 'express';
import { authenticate, type AuthRequest } from '../../middleware/auth.js';
import { requireApproved } from '../../middleware/requireApproved.js';
import { requireRole } from '../../middleware/requireRole.js';
import {
  adminReviewDutySwap,
  cancelDutySwapRequest,
  createDutySwapRequest,
  getDutySwapRequest,
  listAdminDutySwaps,
  listMyDutySwaps,
  respondToDutySwap,
} from './duty-swaps.service.js';
import {
  adminListQuerySchema,
  adminReviewSchema,
  counterpartyRespondSchema,
  createDutySwapSchema,
  dutySwapIdParamSchema,
  listMineQuerySchema,
} from './duty-swaps.schemas.js';

export const dutySwapsRouter = Router();

dutySwapsRouter.use(authenticate, requireApproved);

dutySwapsRouter.post('/', async (req: AuthRequest, res, next) => {
  try {
    const body = createDutySwapSchema.parse(req.body);
    const data = await createDutySwapRequest(req.user!.sub, body);
    res.status(201).json(data);
  } catch (e) {
    next(e);
  }
});

dutySwapsRouter.get('/mine', async (req: AuthRequest, res, next) => {
  try {
    const query = listMineQuerySchema.parse(req.query);
    const data = await listMyDutySwaps(req.user!.sub, query.role, query.status);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

dutySwapsRouter.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const id = dutySwapIdParamSchema.parse(req.params.id);
    const isAdmin = req.user!.role === 'admin';
    const data = await getDutySwapRequest(id, req.user!.sub, isAdmin);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

dutySwapsRouter.patch('/:id/respond', async (req: AuthRequest, res, next) => {
  try {
    const id = dutySwapIdParamSchema.parse(req.params.id);
    const body = counterpartyRespondSchema.parse(req.body);
    const data = await respondToDutySwap(
      id,
      req.user!.sub,
      body.action,
      body.rejectReason,
    );
    res.json(data);
  } catch (e) {
    next(e);
  }
});

dutySwapsRouter.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const id = dutySwapIdParamSchema.parse(req.params.id);
    const data = await cancelDutySwapRequest(id, req.user!.sub);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

export const adminDutySwapsRouter = Router();

adminDutySwapsRouter.use(authenticate, requireRole('admin'));

adminDutySwapsRouter.get('/', async (req, res, next) => {
  try {
    const query = adminListQuerySchema.parse(req.query);
    const data = await listAdminDutySwaps(query.status, query.limit, query.cursor);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

adminDutySwapsRouter.patch('/:id', async (req: AuthRequest, res, next) => {
  try {
    const id = dutySwapIdParamSchema.parse(req.params.id);
    const body = adminReviewSchema.parse(req.body);
    const adminComment =
      body.action === 'approve' ? body.adminComment?.trim() || 'Одобрено' : body.adminComment;
    const data = await adminReviewDutySwap(id, req.user!.sub, body.action, adminComment);
    res.json(data);
  } catch (e) {
    next(e);
  }
});
