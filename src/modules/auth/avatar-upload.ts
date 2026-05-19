import multer from 'multer';
import { env } from '../../config/env.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxAvatarSize },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Допустимы только JPEG, PNG или WebP'));
    }
  },
});
