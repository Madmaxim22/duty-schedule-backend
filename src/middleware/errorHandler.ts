import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import { env } from '../config/env.js';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      message: 'Ошибка валидации',
      errors: err.flatten().fieldErrors,
    });
    return;
  }

  if (err instanceof MulterError) {
    const isChatUpload = _req.path.includes('/attachments');
    const maxSize = isChatUpload ? env.maxChatAttachmentSize : env.maxAvatarSize;
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `Файл слишком большой (макс. ${Math.round(maxSize / 1024 / 1024)} МБ)`
        : err.code === 'LIMIT_FILE_COUNT'
          ? `Слишком много файлов (макс. ${env.maxChatAttachmentsPerMessage})`
          : 'Ошибка загрузки файла';
    res.status(400).json({ message });
    return;
  }

  if (err instanceof Error && err.message.includes('Допустимы только')) {
    res.status(400).json({ message: err.message });
    return;
  }

  console.error(err);
  res.status(500).json({ message: 'Внутренняя ошибка сервера' });
}
