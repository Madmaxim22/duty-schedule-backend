import multer from 'multer';
import { env } from '../../config/env.js';
import { CHAT_IMAGE_MIME } from '../../lib/chat-attachments.js';
import { CHAT_VIDEO_MIME } from '../../lib/chat-video.js';

const CHAT_ATTACHMENT_MIME = new Set([...CHAT_IMAGE_MIME, ...CHAT_VIDEO_MIME]);

export const chatAttachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Math.max(env.maxChatAttachmentSize, env.maxChatVideoAttachmentSize),
    files: env.maxChatAttachmentsPerMessage,
  },
  fileFilter: (_req, file, cb) => {
    if (CHAT_ATTACHMENT_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Допустимы только JPEG, PNG, WebP, GIF, MP4, WebM или MOV'));
    }
  },
});
