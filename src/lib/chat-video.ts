import { execFile } from 'child_process';
import { promisify } from 'util';
import { rename, stat, unlink, writeFile } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { env } from '../config/env.js';
import {
  ensureChatUploadDirs,
  getChatAttachmentFilePath,
  getChatAttachmentRelativePath,
} from './chat-attachments.js';
import { AppError } from './errors.js';

const execFileAsync = promisify(execFile);

export const CHAT_VIDEO_MIME = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

function getVideoExtension(mimeType: string): string {
  switch (mimeType) {
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

export function getChatVideoPosterRelativePath(id: string): string {
  return `/uploads/chat/${id}.poster.webp`;
}

export function getChatVideoPosterFilePath(id: string): string {
  return path.join(env.uploadDir, 'chat', `${id}.poster.webp`);
}

export async function removeChatVideoPoster(id: string): Promise<void> {
  try {
    await unlink(getChatVideoPosterFilePath(id));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

type VideoProbe = {
  width: number;
  height: number;
  durationMs: number | null;
};

async function probeChatVideoFile(filePath: string): Promise<VideoProbe> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height',
      '-show_entries',
      'format=duration',
      '-of',
      'json',
      filePath,
    ]);
    const parsed = JSON.parse(stdout) as {
      streams?: Array<{ width?: number; height?: number }>;
      format?: { duration?: string };
    };
    const stream = parsed.streams?.[0];
    const width = stream?.width ?? 0;
    const height = stream?.height ?? 0;
    if (!width || !height) {
      throw new AppError(400, 'Не удалось прочитать видео');
    }
    const durationSec = parsed.format?.duration ? parseFloat(parsed.format.duration) : NaN;
    const durationMs = Number.isFinite(durationSec) ? Math.round(durationSec * 1000) : null;
    return { width, height, durationMs };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(400, 'Некорректный файл видео');
  }
}

async function extractChatVideoPoster(id: string, videoPath: string): Promise<string> {
  const posterPath = getChatVideoPosterFilePath(id);
  const tempJpeg = path.join(env.uploadDir, 'chat', `${id}.poster.tmp.jpg`);

  try {
    await execFileAsync('ffmpeg', [
      '-y',
      '-ss',
      '1',
      '-i',
      videoPath,
      '-frames:v',
      '1',
      '-q:v',
      '2',
      tempJpeg,
    ]);

    const webpBuffer = await sharp(tempJpeg)
      .rotate()
      .resize(640, 640, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    await writeFile(posterPath, webpBuffer);
    return getChatVideoPosterRelativePath(id);
  } finally {
    await unlink(tempJpeg).catch(() => undefined);
  }
}

export async function saveChatAttachmentVideo(
  id: string,
  sourcePath: string,
  mimeType: string,
): Promise<{
  url: string;
  ext: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  posterUrl: string;
  durationMs: number | null;
}> {
  if (!CHAT_VIDEO_MIME.has(mimeType)) {
    throw new AppError(400, 'Допустимы только MP4, WebM или MOV');
  }

  const { size } = await stat(sourcePath);
  if (size > env.maxChatVideoAttachmentSize) {
    const limitMb = Math.round(env.maxChatVideoAttachmentSize / 1024 / 1024);
    throw new AppError(400, `Видео не должно превышать ${limitMb} МБ`);
  }

  await ensureChatUploadDirs();
  const ext = getVideoExtension(mimeType);
  const filePath = getChatAttachmentFilePath(id, ext);
  await rename(sourcePath, filePath);

  try {
    const probe = await probeChatVideoFile(filePath);
    const posterUrl = await extractChatVideoPoster(id, filePath);
    return {
      url: getChatAttachmentRelativePath(id, ext),
      ext,
      mimeType,
      size,
      width: probe.width,
      height: probe.height,
      posterUrl,
      durationMs: probe.durationMs,
    };
  } catch (err) {
    await unlink(filePath).catch(() => undefined);
    await removeChatVideoPoster(id).catch(() => undefined);
    throw err;
  }
}
