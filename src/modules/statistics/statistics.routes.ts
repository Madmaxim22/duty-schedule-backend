import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { getAdminStatistics } from './statistics.service.js';
import { getAdminActivityStatistics } from './activity-statistics.service.js';
import { statisticsQuerySchema } from './statistics.schemas.js';

export const statisticsRouter = Router();

statisticsRouter.use(authenticate, requireRole('admin'));

statisticsRouter.get('/', async (req, res, next) => {
  try {
    const query = statisticsQuerySchema.parse(req.query);
    const data = await getAdminStatistics(query.year, query.month);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

statisticsRouter.get('/activity', async (req, res, next) => {
  try {
    const query = statisticsQuerySchema.parse(req.query);
    const data = await getAdminActivityStatistics(query.year, query.month);
    res.json(data);
  } catch (e) {
    next(e);
  }
});
