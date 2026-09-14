import { exportDashboardSnapshot } from '../lib/notion-cache.js';

const MAX_ATTEMPTS = 3;

function isRetryableExportError(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const status = 'status' in e ? (e as { status?: number }).status : null;
  if (status === 408 || status === 502 || status === 503 || status === 504) return true;
  const code = 'code' in e ? (e as { code?: string }).code : null;
  return code === 'rate_limited';
}

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  try {
    if (attempt > 1) {
      const waitSec = 20 * attempt;
      console.warn(`export 전체 재시도 ${attempt}/${MAX_ATTEMPTS} — ${waitSec}s 대기...`);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
    }

    const data = await exportDashboardSnapshot();
    console.log(
      `✅ public/dashboard.snapshot.json — ${data.stats.totalArticles}편 · 주간 ${data.weeklies.length} · 일일 ${data.dailies.length}`,
    );
    process.exit(0);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (attempt < MAX_ATTEMPTS && isRetryableExportError(e)) {
      console.warn(`export 실패 (${msg}) — 재시도 예정`);
      continue;
    }
    throw e;
  }
}
