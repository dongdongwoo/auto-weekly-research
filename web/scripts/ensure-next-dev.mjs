import fs from 'node:fs';
import path from 'node:path';

const nextDir = path.join(process.cwd(), '.next');
const required = ['routes-manifest.json', 'prerender-manifest.json', 'build-manifest.json'];

if (!fs.existsSync(nextDir)) process.exit(0);

const missing = required.filter((file) => !fs.existsSync(path.join(nextDir, file)));
if (missing.length > 0) {
  console.warn(`⚠️  .next 캐시 손상 (${missing.join(', ')}) — 삭제 후 dev 서버가 재생성합니다`);
  fs.rmSync(nextDir, { recursive: true, force: true });
}
