import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? '',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me',
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? '30m',
  refreshTokenDays: Number(process.env.REFRESH_TOKEN_DAYS ?? 7),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  adminEmail: process.env.ADMIN_EMAIL ?? 'admin@duty.local',
  adminPassword: process.env.ADMIN_PASSWORD ?? 'admin123',
  adminFullName: process.env.ADMIN_FULL_NAME ?? 'Администратор',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
};

export function assertProductionEnv(): void {
  if (env.nodeEnv === 'production') {
    required('DATABASE_URL');
    required('JWT_SECRET');
    required('JWT_REFRESH_SECRET');
  }
}
