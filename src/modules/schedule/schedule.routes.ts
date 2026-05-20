import { Router } from 'express';
import { authenticate, type AuthRequest } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import {
  getDaySchedule,
  getMonthSchedule,
  putDaySchedule,
  listDutyAssignmentChanges,
} from './schedule.service.js';
import { importSchedule } from './schedule-import.service.js';
import {
  changesQuerySchema,
  dateParamSchema,
  importScheduleSchema,
  monthQuerySchema,
  putDaySchema,
} from './schedule.schemas.js';
import { DUTY_SECTIONS } from '../../lib/offices.js';

export const scheduleRouter = Router();

scheduleRouter.get('/sections', authenticate, (_req, res) => {
  res.json({ sections: DUTY_SECTIONS });
});

scheduleRouter.get('/month', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const query = monthQuerySchema.parse(req.query);
    const data = await getMonthSchedule(
      query.year,
      query.month,
      req.user!.sub,
      req.user!.role === 'admin',
    );
    res.json(data);
  } catch (e) {
    next(e);
  }
});

scheduleRouter.get('/day/:date', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const date = dateParamSchema.parse(req.params.date);
    const data = await getDaySchedule(date, req.user!.sub);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

scheduleRouter.get(
  '/changes',
  authenticate,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const query = changesQuerySchema.parse(req.query);
      const data = await listDutyAssignmentChanges(query.limit, query.cursor);
      res.json(data);
    } catch (e) {
      next(e);
    }
  },
);

scheduleRouter.post(
  '/import',
  authenticate,
  requireRole('admin'),
  async (req: AuthRequest, res, next) => {
    try {
      const body = importScheduleSchema.parse(req.body);
      const data = await importSchedule({
        replaceFrom: body.replaceFrom,
        replaceTo: body.replaceTo,
        records: body.records,
        adminId: req.user!.sub,
      });
      res.json(data);
    } catch (e) {
      next(e);
    }
  },
);

scheduleRouter.put(
  '/day/:date',
  authenticate,
  requireRole('admin'),
  async (req: AuthRequest, res, next) => {
    try {
      const date = dateParamSchema.parse(req.params.date);
      const body = putDaySchema.parse(req.body);
      const data = await putDaySchedule(date, body.assignments, req.user!.sub);
      res.json(data);
    } catch (e) {
      next(e);
    }
  },
);
