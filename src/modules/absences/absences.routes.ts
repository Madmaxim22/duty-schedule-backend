import { Router } from 'express';
import { authenticate, type AuthRequest } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import {
  deleteAbsences,
  listAbsenceTypes,
  listAbsences,
  upsertAbsences,
} from './absences.service.js';
import {
  deleteAbsencesSchema,
  listAbsencesQuerySchema,
  upsertAbsencesSchema,
} from './absences.schemas.js';

export const absencesRouter = Router();

absencesRouter.use(authenticate, requireRole('admin'));

absencesRouter.get('/types', (_req, res) => {
  res.json({ types: listAbsenceTypes() });
});

absencesRouter.get('/', async (req, res, next) => {
  try {
    const query = listAbsencesQuerySchema.parse(req.query);
    const data = await listAbsences(query);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

absencesRouter.post('/', async (req: AuthRequest, res, next) => {
  try {
    const body = upsertAbsencesSchema.parse(req.body);
    const data = await upsertAbsences(body, req.user!.sub);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

absencesRouter.delete('/', async (req: AuthRequest, res, next) => {
  try {
    const body = deleteAbsencesSchema.parse(req.body);
    const data = await deleteAbsences(body);
    res.json(data);
  } catch (e) {
    next(e);
  }
});
