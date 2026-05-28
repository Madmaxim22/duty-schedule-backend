import { env } from '../../config/env.js';
import { extensionFromUrl, removeChatAttachmentFile } from '../../lib/chat-attachments.js';
import { prisma } from '../../lib/prisma.js';

export async function purgeOrphanChatAttachments(): Promise<number> {
  const cutoff = new Date(Date.now() - env.chatAttachmentOrphanTtlMs);
  const orphans = await prisma.chatMessageAttachment.findMany({
    where: { messageId: null, createdAt: { lt: cutoff } },
    select: { id: true, url: true },
  });

  for (const row of orphans) {
    await removeChatAttachmentFile(row.id, extensionFromUrl(row.url));
  }

  if (orphans.length > 0) {
    await prisma.chatMessageAttachment.deleteMany({
      where: { id: { in: orphans.map((o) => o.id) } },
    });
  }

  return orphans.length;
}
