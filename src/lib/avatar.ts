import { mkdir, unlink, writeFile } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { env } from '../config/env.js';
import { AppError } from './errors.js';

const MAX_PHOTO_DIMENSION = 1200;
const WEBP_QUALITY = 80;

export function getAvatarRelativePath(userId: string) {
  return `/uploads/avatars/${userId}.webp`;
}

export function getPhotoRelativePath(photoId: string) {
  return `/uploads/photos/${photoId}.webp`;
}

export function getAvatarFilePath(userId: string) {
  return path.join(env.uploadDir, 'avatars', `${userId}.webp`);
}

export function getPhotoFilePath(photoId: string) {
  return path.join(env.uploadDir, 'photos', `${photoId}.webp`);
}

export async function ensureUploadDirs() {
  await mkdir(path.join(env.uploadDir, 'avatars'), { recursive: true });
  await mkdir(path.join(env.uploadDir, 'photos'), { recursive: true });
}

export async function processAvatarImage(sourcePath: string): Promise<Buffer> {
  try {
    const metadata = await sharp(sourcePath).metadata();
    if (!metadata.width || !metadata.height) {
      throw new AppError(400, 'Не удалось прочитать изображение');
    }

    return sharp(sourcePath)
      .rotate()
      .resize(MAX_PHOTO_DIMENSION, MAX_PHOTO_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(400, 'Некорректный файл изображения');
  }
}

/** @deprecated Use savePhotoFile */
export async function saveAvatarFile(userId: string, sourcePath: string) {
  const processed = await processAvatarImage(sourcePath);
  await ensureUploadDirs();
  await writeFile(getAvatarFilePath(userId), processed);
  return getAvatarRelativePath(userId);
}

export async function savePhotoFile(photoId: string, sourcePath: string) {
  const processed = await processAvatarImage(sourcePath);
  await ensureUploadDirs();
  await writeFile(getPhotoFilePath(photoId), processed);
  return getPhotoRelativePath(photoId);
}

/** @deprecated Legacy single-avatar file */
export async function removeAvatarFile(userId: string) {
  try {
    await unlink(getAvatarFilePath(userId));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

export async function removePhotoFile(photoId: string) {
  try {
    await unlink(getPhotoFilePath(photoId));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}
