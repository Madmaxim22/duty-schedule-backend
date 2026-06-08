import { randomUUID } from 'crypto';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { removePhotoFile, savePhotoFile } from '../../lib/avatar.js';
import { toPublicUser } from '../../lib/public-user.js';
import { MAX_USER_PHOTOS } from './user-photos.constants.js';

export type PhotoListItem = {
  id: string;
  url: string;
  isCurrent: boolean;
  focusX: number;
  focusY: number;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
};

async function getLikeMetaForPhotos(photoIds: string[], viewerId: string) {
  if (photoIds.length === 0) {
    return new Map<string, { likeCount: number; likedByMe: boolean }>();
  }

  const [counts, myLikes] = await Promise.all([
    prisma.photoLike.groupBy({
      by: ['photoId'],
      where: { photoId: { in: photoIds } },
      _count: { photoId: true },
    }),
    prisma.photoLike.findMany({
      where: { photoId: { in: photoIds }, likerId: viewerId },
      select: { photoId: true },
    }),
  ]);

  const likedSet = new Set(myLikes.map((l) => l.photoId));
  const countMap = new Map(counts.map((c) => [c.photoId, c._count.photoId]));

  return new Map(
    photoIds.map((id) => [
      id,
      {
        likeCount: countMap.get(id) ?? 0,
        likedByMe: likedSet.has(id),
      },
    ]),
  );
}

function mapPhotoRow(
  photo: {
    id: string;
    url: string;
    isCurrent: boolean;
    focusX: number;
    focusY: number;
    createdAt: Date;
  },
  meta: { likeCount: number; likedByMe: boolean },
): PhotoListItem {
  return {
    id: photo.id,
    url: photo.url,
    isCurrent: photo.isCurrent,
    focusX: photo.focusX,
    focusY: photo.focusY,
    createdAt: photo.createdAt.toISOString(),
    likeCount: meta.likeCount,
    likedByMe: meta.likedByMe,
  };
}

async function assertApprovedPhotoOwner(userId: string) {
  const owner = await prisma.user.findFirst({
    where: { id: userId, status: 'approved' },
    select: { id: true },
  });
  if (!owner) {
    throw new AppError(404, 'Пользователь не найден');
  }
}

export async function listUserPhotos(ownerId: string, viewerId: string) {
  await assertApprovedPhotoOwner(ownerId);

  const photos = await prisma.userPhoto.findMany({
    where: { userId: ownerId },
    orderBy: { createdAt: 'desc' },
  });

  const meta = await getLikeMetaForPhotos(
    photos.map((p) => p.id),
    viewerId,
  );

  return {
    photos: photos.map((p) => mapPhotoRow(p, meta.get(p.id)!)),
    count: photos.length,
    maxPhotos: MAX_USER_PHOTOS,
  };
}

export async function listMyPhotos(userId: string, viewerId: string) {
  return listUserPhotos(userId, viewerId);
}

async function applyCurrentPhoto(
  userId: string,
  photo: { id: string; url: string; focusX: number; focusY: number },
) {
  await prisma.$transaction([
    prisma.userPhoto.updateMany({
      where: { userId, isCurrent: true },
      data: { isCurrent: false },
    }),
    prisma.userPhoto.update({
      where: { id: photo.id },
      data: { isCurrent: true },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        currentPhotoId: photo.id,
        avatarUrl: photo.url,
        avatarFocusX: photo.focusX,
        avatarFocusY: photo.focusY,
      },
    }),
  ]);
}

export async function addPhoto(
  userId: string,
  sourcePath: string,
  options: { setAsCurrent?: boolean } = {},
) {
  const setAsCurrent = options.setAsCurrent !== false;

  try {
    const count = await prisma.userPhoto.count({ where: { userId } });
    if (count >= MAX_USER_PHOTOS) {
      throw new AppError(409, `Максимум ${MAX_USER_PHOTOS} фотографий`);
    }

    const photoId = randomUUID();
    const url = await savePhotoFile(photoId, sourcePath);

    const hasCurrent = await prisma.userPhoto.findFirst({
      where: { userId, isCurrent: true },
    });

    const shouldBeCurrent = setAsCurrent || !hasCurrent;

    const created = await prisma.userPhoto.create({
      data: {
        id: photoId,
        userId,
        url,
        isCurrent: shouldBeCurrent,
      },
    });

    if (shouldBeCurrent) {
      await applyCurrentPhoto(userId, created);
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return {
      photo: mapPhotoRow(created, { likeCount: 0, likedByMe: false }),
      user: toPublicUser(user),
    };
  } finally {
    const { removeTempUpload } = await import('../../lib/multer-disk.js');
    await removeTempUpload(sourcePath).catch(() => undefined);
  }
}

export async function setCurrentPhoto(userId: string, photoId: string) {
  const photo = await prisma.userPhoto.findFirst({
    where: { id: photoId, userId },
  });
  if (!photo) {
    throw new AppError(404, 'Фото не найдено');
  }

  await applyCurrentPhoto(userId, photo);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return toPublicUser(user);
}

export async function updatePhotoFocus(
  userId: string,
  photoId: string,
  focusX: number,
  focusY: number,
) {
  const photo = await prisma.userPhoto.findFirst({
    where: { id: photoId, userId },
  });
  if (!photo) {
    throw new AppError(404, 'Фото не найдено');
  }

  const updated = await prisma.userPhoto.update({
    where: { id: photoId },
    data: {
      focusX: Math.round(focusX),
      focusY: Math.round(focusY),
    },
  });

  if (photo.isCurrent) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        avatarFocusX: updated.focusX,
        avatarFocusY: updated.focusY,
      },
    });
  }

  const meta = await getLikeMetaForPhotos([photoId], userId);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return {
    photo: mapPhotoRow(updated, meta.get(photoId)!),
    user: toPublicUser(user),
  };
}

export async function deletePhoto(userId: string, photoId: string) {
  const photo = await prisma.userPhoto.findFirst({
    where: { id: photoId, userId },
  });
  if (!photo) {
    throw new AppError(404, 'Фото не найдено');
  }

  const wasCurrent = photo.isCurrent;

  await prisma.userPhoto.delete({ where: { id: photoId } });
  await removePhotoFile(photoId);

  if (wasCurrent) {
    const next = await prisma.userPhoto.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (next) {
      await applyCurrentPhoto(userId, next);
    } else {
      await prisma.user.update({
        where: { id: userId },
        data: {
          currentPhotoId: null,
          avatarUrl: null,
          avatarFocusX: 50,
          avatarFocusY: 50,
        },
      });
    }
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return toPublicUser(user);
}

export async function deleteCurrentPhoto(userId: string) {
  const current = await prisma.userPhoto.findFirst({
    where: { userId, isCurrent: true },
  });
  if (!current) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return toPublicUser(user);
  }
  return deletePhoto(userId, current.id);
}

export async function getPhotoForViewer(photoId: string) {
  return prisma.userPhoto.findUnique({
    where: { id: photoId },
    include: { user: { select: { id: true, status: true } } },
  });
}
