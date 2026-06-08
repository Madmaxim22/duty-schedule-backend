import { randomUUID } from 'crypto';
import { mkdir, unlink } from 'fs/promises';
import multer from 'multer';
import path from 'path';
import { env } from '../config/env.js';

export function getUploadTmpDir() {
  return path.join(env.uploadDir, 'tmp');
}

export async function ensureUploadTmpDir() {
  await mkdir(getUploadTmpDir(), { recursive: true });
}

export function createDiskStorage() {
  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      void ensureUploadTmpDir()
        .then(() => cb(null, getUploadTmpDir()))
        .catch((err: unknown) => cb(err as Error, ''));
    },
    filename: (_req, _file, cb) => {
      cb(null, `${randomUUID()}.upload`);
    },
  });
}

export async function removeTempUpload(filePath: string | undefined) {
  if (!filePath) return;
  try {
    await unlink(filePath);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}
