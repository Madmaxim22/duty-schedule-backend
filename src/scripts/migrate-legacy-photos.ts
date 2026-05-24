/**
 * One-off: copy uploads/avatars/{userId}.webp → uploads/photos/{photoId}.webp
 * Run after: npx prisma migrate deploy
 * Usage: npm run db:migrate-photos  (node dist/scripts/migrate-legacy-photos.js)
 */
import { access, copyFile } from 'fs/promises';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { getAvatarFilePath, getPhotoFilePath } from '../lib/avatar.js';

const prisma = new PrismaClient();

async function fileExists(p: string) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const photos = await prisma.userPhoto.findMany({
    select: { id: true, userId: true, url: true },
  });

  let copied = 0;
  for (const photo of photos) {
    const legacyPath = getAvatarFilePath(photo.userId);
    const newPath = getPhotoFilePath(photo.id);
    if (await fileExists(newPath)) continue;
    if (!(await fileExists(legacyPath))) continue;
    await copyFile(legacyPath, newPath);
    copied += 1;
    const expectedUrl = `/uploads/photos/${photo.id}.webp`;
    if (photo.url !== expectedUrl) {
      await prisma.userPhoto.update({
        where: { id: photo.id },
        data: { url: expectedUrl },
      });
    }
  }

  console.log(`Copied ${copied} legacy avatar file(s) to photos/.`);
  console.log(`Upload dir: ${path.resolve(env.uploadDir)}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
