import { seedAdminIfNeeded } from '../src/modules/auth/auth.service.js';

async function main() {
  const admin = await seedAdminIfNeeded();
  console.log(`Admin ready: ${admin.email}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
