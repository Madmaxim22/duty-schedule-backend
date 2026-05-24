import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { getPhotoForViewer } from '../user-photos/user-photos.service.js';

export type PhotoLikeStatus = {
  likeCount: number;
  likedByMe: boolean;
  canLike: boolean;
};

function buildStatus(
  owner: { id: string; status: string },
  currentUserId: string,
  likeCount: number,
  likedByMe: boolean,
): PhotoLikeStatus {
  const canLike = currentUserId !== owner.id && owner.status === 'approved';

  return { likeCount, likedByMe, canLike };
}

export async function getPhotoLikeStatus(
  photoId: string,
  currentUserId: string,
): Promise<PhotoLikeStatus> {
  const photo = await getPhotoForViewer(photoId);
  if (!photo) {
    throw new AppError(404, 'Фото не найдено');
  }

  const [likeCount, myLike] = await Promise.all([
    prisma.photoLike.count({ where: { photoId } }),
    prisma.photoLike.findUnique({
      where: {
        likerId_photoId: { likerId: currentUserId, photoId },
      },
    }),
  ]);

  return buildStatus(photo.user, currentUserId, likeCount, Boolean(myLike));
}

export async function likePhoto(
  photoId: string,
  currentUserId: string,
): Promise<PhotoLikeStatus> {
  const photo = await getPhotoForViewer(photoId);
  if (!photo) {
    throw new AppError(404, 'Фото не найдено');
  }

  if (photo.userId === currentUserId) {
    throw new AppError(400, 'Нельзя оценить своё фото');
  }

  if (photo.user.status !== 'approved') {
    throw new AppError(400, 'Пользователь недоступен');
  }

  try {
    await prisma.photoLike.create({
      data: { likerId: currentUserId, photoId },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new AppError(409, 'Лайк уже поставлен');
    }
    throw e;
  }

  return getPhotoLikeStatus(photoId, currentUserId);
}

export async function unlikePhoto(
  photoId: string,
  currentUserId: string,
): Promise<PhotoLikeStatus> {
  const result = await prisma.photoLike.deleteMany({
    where: { likerId: currentUserId, photoId },
  });

  if (result.count === 0) {
    throw new AppError(404, 'Лайк не найден');
  }

  return getPhotoLikeStatus(photoId, currentUserId);
}
