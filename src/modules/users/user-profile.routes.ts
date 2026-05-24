import { Router } from 'express';
import { z } from 'zod';
import { authenticate, type AuthRequest } from '../../middleware/auth.js';
import { listUserPhotos } from '../user-photos/user-photos.service.js';
import { getApprovedUserProfile } from './users.service.js';

export const userProfileRouter = Router();

userProfileRouter.get('/:id/profile', authenticate, async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const user = await getApprovedUserProfile(id);
    res.json({ user });
  } catch (e) {
    next(e);
  }
});

userProfileRouter.get('/:id/photos', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const data = await listUserPhotos(id, req.user!.sub);
    res.json(data);
  } catch (e) {
    next(e);
  }
});
