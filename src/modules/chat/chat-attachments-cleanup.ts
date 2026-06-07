import { env } from '../../config/env.js';
import { removeChatAttachmentAssets } from '../../lib/chat-attachments.js';
import { prisma } from '../../lib/prisma.js';

export async function purgeOrphanChatAttachments(): Promise<number> {
  const cutoff = new Date(Date.now() - env.chatAttachmentOrphanTtlMs);
  const orphans = await prisma.chatMessageAttachment.findMany({
    where: { messageId: null, createdAt: { lt: cutoff } },
    select: { id: true, url: true, posterUrl: true },
  });

  for (const row of orphans) {
    await removeChatAttachmentAssets(row.id, row.url, row.posterUrl);
  }

  if (orphans.length > 0) {
    await prisma.chatMessageAttachment.deleteMany({
      where: { id: { in: orphans.map((o) => o.id) } },
    });
  }

  return orphans.length;
}
