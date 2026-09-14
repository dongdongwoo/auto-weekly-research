import { exportDashboardSnapshot } from '../lib/notion-cache.js';

const data = await exportDashboardSnapshot();
console.log(
  `✅ public/dashboard.snapshot.json — ${data.stats.totalArticles}편 · 주간 ${data.weeklies.length} · 일일 ${data.dailies.length}`,
);
