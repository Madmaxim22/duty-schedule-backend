import { createApp } from './app.js';
import { env, assertProductionEnv } from './config/env.js';
import { seedAdminIfNeeded } from './modules/auth/auth.service.js';

assertProductionEnv();

const app = createApp();

async function start() {
  await seedAdminIfNeeded();
  app.listen(env.port, () => {
    console.log(`API listening on port ${env.port}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
