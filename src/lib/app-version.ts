import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packagePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../package.json',
);

function readPackageVersion(): string {
  try {
    const raw = readFileSync(packagePath, 'utf-8');
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const packageVersion = readPackageVersion();

export const appVersion = process.env.APP_VERSION ?? packageVersion;

export const appReleaseId = process.env.APP_RELEASE_ID ?? appVersion;
