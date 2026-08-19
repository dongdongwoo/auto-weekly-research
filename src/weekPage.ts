import fs from 'node:fs';
import path from 'node:path';
import { weekNewsDates } from './kst.js';
import { createWeekPage } from './notion.js';

const WEEKS_DIR = path.join(process.cwd(), 'data', 'weeks');

type WeekMeta = {
  weekId: string;
  pageId: string;
  createdAt: string;
};

function weekMetaPath(weekId: string): string {
  return path.join(WEEKS_DIR, `${weekId}.json`);
}

function loadWeekMeta(weekId: string): WeekMeta | null {
  const p = weekMetaPath(weekId);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8')) as WeekMeta;
}

function saveWeekMeta(meta: WeekMeta): void {
  fs.mkdirSync(WEEKS_DIR, { recursive: true });
  fs.writeFileSync(weekMetaPath(meta.weekId), JSON.stringify(meta, null, 2) + '\n', 'utf8');
  console.log(`💾 주간 페이지 ID 저장: data/weeks/${meta.weekId}.json`);
}

function formatShortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

function weekPageTitle(weekId: string, weekAnchorIso: string): string {
  const [mon, , , , , , sun] = weekNewsDates(weekAnchorIso);
  return `📊 ${weekId} 주간 (${formatShortDate(mon)} ~ ${formatShortDate(sun)})`;
}

/** 해당 ISO 주의 Notion 하위 페이지 (없으면 생성) */
export async function ensureWeekPage(weekId: string, weekAnchorIso: string): Promise<string> {
  const existing = loadWeekMeta(weekId);
  if (existing) {
    console.log(`📂 주간 페이지 재사용: ${weekPageTitle(weekId, weekAnchorIso)}`);
    return existing.pageId;
  }

  const title = weekPageTitle(weekId, weekAnchorIso);
  console.log(`🆕 주간 페이지 생성: "${title}"`);

  const pageId = await createWeekPage(title);
  saveWeekMeta({ weekId, pageId, createdAt: weekAnchorIso });
  return pageId;
}
