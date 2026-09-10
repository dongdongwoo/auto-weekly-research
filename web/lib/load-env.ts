import fs from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';

/** web/.env.local 우선, 없으면 루트 .env 의 Claude·Notion 키 사용 */
export function loadSharedEnv() {
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY) return;

  const rootEnv = path.resolve(process.cwd(), '../.env');
  if (fs.existsSync(rootEnv)) config({ path: rootEnv });
}

loadSharedEnv();
