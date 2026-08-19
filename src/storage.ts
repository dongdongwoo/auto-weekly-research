import fs from 'node:fs';
import path from 'node:path';
import { workWeekNewsDates } from './kst.js';

const DATA_DIR = path.join(process.cwd(), 'data', 'daily');

/** data/daily/*.md 날짜 목록 (오름차순) */
export function listDailyFiles(): string[] {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''))
    .filter((iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso))
    .sort();
}

export function dailyFilePath(iso: string): string {
  return path.join(DATA_DIR, `${iso}.md`);
}

export function saveDaily(newsDateIso: string, content: string): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(dailyFilePath(newsDateIso), content.trim() + '\n', 'utf8');
  console.log(`💾 로컬 저장: data/daily/${newsDateIso}.md`);
}

export function readDaily(newsDateIso: string): string | null {
  const p = dailyFilePath(newsDateIso);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8').trim();
}

/** 이번 주 월~금 뉴스 날짜에 해당하는 일일 수집본 (없는 날은 제외) */
export function readWorkWeekDaily(todayIso: string): { iso: string; content: string }[] {
  return workWeekNewsDates(todayIso)
    .map((iso) => ({ iso, content: readDaily(iso) }))
    .filter((d): d is { iso: string; content: string } => d.content !== null && d.content.length > 0);
}
