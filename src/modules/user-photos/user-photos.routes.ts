import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, type AuthRequest } from '../../middleware/auth.js';
import { avatarUpload } from '../auth/avatar-upload.js';
import { AppError } from '../../lib/errors.js';
import {
  addPhoto,
  deletePhoto,
  listMyPhotos,
  setCurrentPhoto,
} from './user-photos.service.js';
import {
  parseSetAsCurrent,
  photoIdParamSchema,
  uploadPhotoQuerySchema,
} from './user-photos.schemas.js';

const photoUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: 'Слишком много загрузок, попробуйте позже' },
});

export const myPhotosRouter = Router();

myPhotosRouter.use(authenticate);

myPhotosRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const data = await listMyPhotos(req.user!.sub, req.user!.sub);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

myPhotosRouter.post(
  '/',
  photoUploadLimiter,
  avatarUpload.single('photo'),
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.file) {
        throw new AppError(400, 'Файл не передан');
      }
      const query = uploadPhotoQuerySchema.parse(req.query);
      const data = await addPhoto(req.user!.sub, req.file.buffer, {
        setAsCurrent: parseSetAsCurrent(query),
      });
      res.status(201).json(data);
    } catch (e) {
      next(e);
    }
  },
);

myPhotosRouter.delete('/:photoId', async (req: AuthRequest, res, next) => {
  try {
    const { photoId } = photoIdParamSchema.parse(req.params);
    const user = await deletePhoto(req.user!.sub, photoId);
    res.json({ user });
  } catch (e) {
    next(e);
  }
});

myPhotosRouter.post('/:photoId/set-current', async (req: AuthRequest, res, next) => {
  try {
    const { photoId } = photoIdParamSchema.parse(req.params);
    const user = await setCurrentPhoto(req.user!.sub, photoId);
    res.json({ user });
  } catch (e) {
    next(e);
  }
});
