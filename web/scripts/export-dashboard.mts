import fs from 'node:fs/promises';
import path from 'node:path';
import '../lib/load-env.js';
import { fetchDashboardData } from '../lib/notion-blocks.js';

const out = path.join(process.cwd(), 'public', 'dashboard.snapshot.json');

const data = await fetchDashboardData();
await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, JSON.stringify(data));
console.log(`✅ ${out} (${data.stats.totalArticles}편)`);
