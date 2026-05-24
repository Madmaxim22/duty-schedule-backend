import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { approvedUsersRouter } from './modules/users/users.routes.js';
import { userProfileRouter } from './modules/users/user-profile.routes.js';
import { scheduleRouter } from './modules/schedule/schedule.routes.js';
import { myPhotosRouter } from './modules/user-photos/user-photos.routes.js';
import { photoLikesRouter } from './modules/photo-likes/photo-likes.routes.js';
import { pushRouter } from './modules/push/push.routes.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigin,
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(cookieParser());
  app.use('/uploads', express.static(path.resolve(env.uploadDir)));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/admin/users', usersRouter);
  app.use('/api/users/me/photos', myPhotosRouter);
  app.use('/api/users', userProfileRouter);
  app.use('/api/users', approvedUsersRouter);
  app.use('/api/schedule', scheduleRouter);
  app.use('/api/photos', photoLikesRouter);
  app.use('/api/push', pushRouter);

  app.use(errorHandler);

  return app;
}
