import multer from 'multer';
import { env } from '../../config/env.js';
import { createDiskStorage } from '../../lib/multer-disk.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const avatarUpload = multer({
  storage: createDiskStorage(),
  limits: { fileSize: env.maxAvatarSize },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Допустимы только JPEG, PNG или WebP'));
    }
  },
});
