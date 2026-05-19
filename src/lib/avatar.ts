import { mkdir, unlink, writeFile } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { env } from '../config/env.js';
import { AppError } from './errors.js';

const AVATAR_SIZE = 256;
const WEBP_QUALITY = 80;

export function getAvatarRelativePath(userId: string) {
  return `/uploads/avatars/${userId}.webp`;
}

export function getAvatarFilePath(userId: string) {
  return path.join(env.uploadDir, 'avatars', `${userId}.webp`);
}

export async function ensureUploadDirs() {
  await mkdir(path.join(env.uploadDir, 'avatars'), { recursive: true });
}

export async function processAvatarImage(buffer: Buffer): Promise<Buffer> {
  try {
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height) {
      throw new AppError(400, 'Не удалось прочитать изображение');
    }

    return sharp(buffer)
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'centre' })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(400, 'Некорректный файл изображения');
  }
}

export async function saveAvatarFile(userId: string, buffer: Buffer) {
  const processed = await processAvatarImage(buffer);
  await ensureUploadDirs();
  await writeFile(getAvatarFilePath(userId), processed);
  return getAvatarRelativePath(userId);
}

export async function removeAvatarFile(userId: string) {
  try {
    await unlink(getAvatarFilePath(userId));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}
