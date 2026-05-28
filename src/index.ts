import { createServer } from 'http';
import { createApp } from './app.js';
import { env, assertProductionEnv } from './config/env.js';
import { ensureUploadDirs } from './lib/avatar.js';
import { ensureChatUploadDirs } from './lib/chat-attachments.js';
import { purgeOrphanChatAttachments } from './modules/chat/chat-attachments-cleanup.js';
import { seedAdminIfNeeded } from './modules/auth/auth.service.js';
import { attachChatWebSocket } from './ws/chat-ws.server.js';

assertProductionEnv();

const app = createApp();
// Не передавать app в createServer(app): при некоторых прокси upgrade может попасть в «request»,
// Express ответит 404 до handleUpgrade. Явно пропускаем websocket-handshake в стек Express.
const server = createServer((req, res) => {
  if (String(req.headers.upgrade ?? '').toLowerCase() === 'websocket') {
    return;
  }
  app(req, res);
});

attachChatWebSocket(server);

async function start() {
  await ensureUploadDirs();
  await ensureChatUploadDirs();
  await purgeOrphanChatAttachments();
  await seedAdminIfNeeded();
  server.listen(env.port, () => {
    console.log(`API listening on port ${env.port}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
