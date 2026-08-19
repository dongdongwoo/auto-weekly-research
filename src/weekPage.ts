import fs from 'node:fs';
import path from 'node:path';
import { workWeekNewsDates, isMondayKst } from './kst.js';
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

function weekPageTitle(weekId: string, todayIso: string): string {
  const [mon, , , , fri] = workWeekNewsDates(todayIso);
  return `📊 ${weekId} 주간 (${formatShortDate(mon)} ~ ${formatShortDate(fri)})`;
}

/**
 * 이번 주 Notion 하위 페이지를 반환한다.
 * - 월요일: 부모 페이지(NOTION_PAGE_ID) 아래 새 주간 페이지 생성
 * - 화~금: 저장된 pageId 재사용 (월요일을 놓친 경우 그때 생성)
 */
export async function ensureWeekPage(weekId: string, todayIso: string): Promise<string> {
  const existing = loadWeekMeta(weekId);
  if (existing) {
    console.log(`📂 주간 페이지 재사용: ${weekPageTitle(weekId, todayIso)}`);
    return existing.pageId;
  }

  const title = weekPageTitle(weekId, todayIso);
  if (isMondayKst()) {
    console.log(`🆕 월요일 — 새 주간 페이지 생성: "${title}"`);
  } else {
    console.log(`🆕 주간 페이지 없음 — 생성: "${title}"`);
  }

  const pageId = await createWeekPage(title);
  saveWeekMeta({ weekId, pageId, createdAt: todayIso });
  return pageId;
}
