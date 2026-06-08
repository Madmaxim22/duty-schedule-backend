import { copyFile, mkdir, stat, unlink, writeFile } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { env } from '../config/env.js';
import { AppError } from './errors.js';

const MAX_CHAT_IMAGE_DIMENSION = 1600;
const WEBP_QUALITY = 82;

export const CHAT_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export function sanitizeChatFileName(name: string): string {
  const base = path.basename(name).replace(/[^\w.\-() \u0400-\u04FF]/gi, '_');
  const trimmed = base.trim() || 'image';
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed;
}

export function getChatAttachmentExtension(mimeType: string): string {
  switch (mimeType) {
    case 'image/gif':
      return 'gif';
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'video/mp4':
      return 'mp4';
    case 'video/webm':
      return 'webm';
    case 'video/quicktime':
      return 'mov';
    default:
      return 'bin';
  }
}

export function getChatAttachmentRelativePath(id: string, ext: string) {
  return `/uploads/chat/${id}.${ext}`;
}

export function getChatAttachmentFilePath(id: string, ext: string) {
  return path.join(env.uploadDir, 'chat', `${id}.${ext}`);
}

export async function ensureChatUploadDirs() {
  await mkdir(path.join(env.uploadDir, 'chat'), { recursive: true });
}

async function processRasterImage(sourcePath: string): Promise<{
  buffer: Buffer;
  ext: string;
  mimeType: string;
  width: number;
  height: number;
}> {
  try {
    const metadata = await sharp(sourcePath).metadata();
    if (!metadata.width || !metadata.height) {
      throw new AppError(400, 'Не удалось прочитать изображение');
    }

    const processed = await sharp(sourcePath)
      .rotate()
      .resize(MAX_CHAT_IMAGE_DIMENSION, MAX_CHAT_IMAGE_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();

    const outMeta = await sharp(processed).metadata();
    if (!outMeta.width || !outMeta.height) {
      throw new AppError(400, 'Не удалось прочитать изображение');
    }

    return {
      buffer: processed,
      ext: 'webp',
      mimeType: 'image/webp',
      width: outMeta.width,
      height: outMeta.height,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(400, 'Некорректный файл изображения');
  }
}

export async function saveChatAttachmentImage(
  id: string,
  sourcePath: string,
  mimeType: string,
): Promise<{ url: string; ext: string; mimeType: string; size: number; width: number; height: number }> {
  if (!CHAT_IMAGE_MIME.has(mimeType)) {
    throw new AppError(400, 'Допустимы только JPEG, PNG, WebP или GIF');
  }

  await ensureChatUploadDirs();

  let ext: string;
  let outMime: string;
  let width: number;
  let height: number;
  let size: number;

  if (mimeType === 'image/gif') {
    const metadata = await sharp(sourcePath, { animated: true }).metadata();
    if (!metadata.width || !metadata.height) {
      throw new AppError(400, 'Не удалось прочитать GIF');
    }
    ext = 'gif';
    outMime = 'image/gif';
    width = metadata.width;
    height = metadata.height;
    const destPath = getChatAttachmentFilePath(id, ext);
    await copyFile(sourcePath, destPath);
    size = (await stat(destPath)).size;
    return {
      url: getChatAttachmentRelativePath(id, ext),
      ext,
      mimeType: outMime,
      size,
      width,
      height,
    };
  }

  const processed = await processRasterImage(sourcePath);
  ext = processed.ext;
  outMime = processed.mimeType;
  width = processed.width;
  height = processed.height;
  const destPath = getChatAttachmentFilePath(id, ext);
  await writeFile(destPath, processed.buffer);
  size = processed.buffer.length;

  return {
    url: getChatAttachmentRelativePath(id, ext),
    ext,
    mimeType: outMime,
    size,
    width,
    height,
  };
}

export async function removeChatAttachmentFile(id: string, ext: string) {
  try {
    await unlink(getChatAttachmentFilePath(id, ext));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

export async function removeChatAttachmentAssets(
  id: string,
  url: string,
  posterUrl?: string | null,
) {
  await removeChatAttachmentFile(id, extensionFromUrl(url));
  if (posterUrl) {
    const { removeChatVideoPoster } = await import('./chat-video.js');
    await removeChatVideoPoster(id);
  }
}

export function extensionFromUrl(url: string): string {
  const match = url.match(/\.([a-z0-9]+)$/i);
  return match?.[1] ?? 'webp';
}
