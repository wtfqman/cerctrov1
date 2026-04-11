import { existsSync } from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv';

const ENV_FILES = ['.env', '.env.local'];

let loaded = false;

export function loadEnvFiles() {
  if (loaded) {
    return;
  }

  for (const fileName of ENV_FILES) {
    const resolvedFilePath = path.resolve(process.cwd(), fileName);

    if (existsSync(resolvedFilePath)) {
      dotenv.config({
        override: fileName.endsWith('.local'),
        path: resolvedFilePath,
        quiet: true,
      });
    }
  }

  if (process.env.DATABASE_URL === 'file:./prisma/dev.db') {
    process.env.DATABASE_URL = 'file:./dev.db';
  }

  loaded = true;
}
