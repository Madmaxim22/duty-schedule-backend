import { Router } from 'express';
import { authenticate, type AuthRequest } from '../../middleware/auth.js';
import { getPhotoLikeStatus, likePhoto, unlikePhoto } from './photo-likes.service.js';
import { photoIdParamSchema } from './photo-likes.schemas.js';

export const photoLikesRouter = Router();

photoLikesRouter.get('/:photoId/likes', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { photoId } = photoIdParamSchema.parse(req.params);
    const data = await getPhotoLikeStatus(photoId, req.user!.sub);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

photoLikesRouter.post('/:photoId/likes', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { photoId } = photoIdParamSchema.parse(req.params);
    const data = await likePhoto(photoId, req.user!.sub);
    res.status(201).json(data);
  } catch (e) {
    next(e);
  }
});

photoLikesRouter.delete('/:photoId/likes', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { photoId } = photoIdParamSchema.parse(req.params);
    const data = await unlikePhoto(photoId, req.user!.sub);
    res.json(data);
  } catch (e) {
    next(e);
  }
});
