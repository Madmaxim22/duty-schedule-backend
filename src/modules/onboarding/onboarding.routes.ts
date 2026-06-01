import { Router } from 'express';
import { authenticate, type AuthRequest } from '../../middleware/auth.js';
import { requireApproved } from '../../middleware/requireApproved.js';
import { AppError } from '../../lib/errors.js';
import { env } from '../../config/env.js';
import { appReleaseId, appVersion } from '../../lib/app-version.js';
import {
  achievementsSeenSchema,
  releaseAckSchema,
} from './onboarding.schemas.js';
import {
  acknowledgeRelease,
  getOnboardingState,
  listReleases,
  markAchievementsSeen,
} from './onboarding.service.js';

export const onboardingRouter = Router();
export const versionRouter = Router();
export const releasesRouter = Router();

const protectedMiddleware = [authenticate, requireApproved] as const;

onboardingRouter.use(...protectedMiddleware);
releasesRouter.use(...protectedMiddleware);
versionRouter.use(...protectedMiddleware);

versionRouter.get('/', (_req, res) => {
  res.json({
    version: appVersion,
    releaseId: appReleaseId,
    environment: env.nodeEnv,
  });
});

releasesRouter.get('/', (_req, res) => {
  res.json(listReleases());
});

onboardingRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const data = await getOnboardingState(req.user!.sub);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

onboardingRouter.post('/release-ack', async (req: AuthRequest, res, next) => {
  try {
    const body = releaseAckSchema.parse(req.body);
    await acknowledgeRelease(req.user!.sub, body.releaseId);
    res.status(204).send();
  } catch (e) {
    if (e instanceof Error && e.message === 'Неизвестный релиз') {
      next(new AppError(400, e.message));
      return;
    }
    next(e);
  }
});

onboardingRouter.post('/achievements/seen', async (req: AuthRequest, res, next) => {
  try {
    const body = achievementsSeenSchema.parse(req.body);
    await markAchievementsSeen(req.user!.sub, body.period, body.achievementIds);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});
