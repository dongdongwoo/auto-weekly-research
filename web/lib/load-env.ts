import fs from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';

/** web/.env.local · 루트 .env — Notion·Claude 키 */
export function loadSharedEnv() {
  const candidates = [
    path.resolve(process.cwd(), 'web/.env.local'),
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
  ];
  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) config({ path: envPath });
  }
}

loadSharedEnv();
