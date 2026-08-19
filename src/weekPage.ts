import { weekNewsDates } from './kst.js';
import { createWeekPage } from './notion.js';
import { findWeekPageId } from './notionRead.js';

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
  const existing = await findWeekPageId(weekId);
  if (existing) {
    console.log(`📂 주간 페이지 재사용: ${weekPageTitle(weekId, weekAnchorIso)}`);
    return existing;
  }

  const title = weekPageTitle(weekId, weekAnchorIso);
  console.log(`🆕 주간 페이지 생성: "${title}"`);
  return createWeekPage(title);
}
