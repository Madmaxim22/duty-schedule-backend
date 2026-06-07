import { CHAT_IMAGE_MIME } from './chat-attachments.js';
import { CHAT_VIDEO_MIME } from './chat-video.js';
import { AppError } from './errors.js';

export function isChatImageMime(mimeType: string): boolean {
  return CHAT_IMAGE_MIME.has(mimeType);
}

export function isChatVideoMime(mimeType: string): boolean {
  return CHAT_VIDEO_MIME.has(mimeType);
}

export function attachmentPreviewLabel(mimeTypes: string[]): string {
  if (mimeTypes.length === 0) return '';
  const hasImage = mimeTypes.some(isChatImageMime);
  const hasVideo = mimeTypes.some(isChatVideoMime);
  if (hasImage && hasVideo) return 'Медиа';
  if (hasVideo) return 'Видео';
  if (hasImage) return 'Фото';
  return 'Вложение';
}

export function assertHomogeneousAttachmentKinds(mimeTypes: string[]): void {
  const hasImage = mimeTypes.some(isChatImageMime);
  const hasVideo = mimeTypes.some(isChatVideoMime);
  if (hasImage && hasVideo) {
    throw new AppError(400, 'Фото и видео нельзя отправить в одном сообщении');
  }
}
