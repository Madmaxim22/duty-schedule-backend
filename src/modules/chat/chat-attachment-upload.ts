import multer from 'multer';
import { env } from '../../config/env.js';
import { CHAT_IMAGE_MIME } from '../../lib/chat-attachments.js';

export const chatAttachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.maxChatAttachmentSize,
    files: env.maxChatAttachmentsPerMessage,
  },
  fileFilter: (_req, file, cb) => {
    if (CHAT_IMAGE_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Допустимы только JPEG, PNG, WebP или GIF'));
    }
  },
});
