import { generateWithSearch } from './claude.js';
import { upsertNamedToggle } from './notion.js';
import {
  fetchDailyLogsInRange,
  readDailyMarkdown,
  readNamedToggle,
} from './notionRead.js';
import { dailyTrendingPrompt, dailiesLogsToMarkdown, weeklyTrendingPrompt } from './trendPrompts.js';
import { parseTrendMarkdown } from './trendParse.js';
import { addIsoDays, isoWeekId, kstStamp, kstToday } from './kst.js';

const DAILY_TREND_RE = /📈\s*데일리\s*급등/;
const WEEKLY_TREND_RE = /📈\s*주간\s*상위/;
const WINDOW_DAYS = 7;

function formatKstHuman(iso: string): string {
  const [y, m, day] = iso.split('-').map(Number);
  return `${y}년 ${m}월 ${day}일`;
}

export async function refreshDailyTrend(
  weekPageId: string,
  newsIso: string,
  opts: { added?: number; force?: boolean } = {},
): Promise<void> {
  const { added = 0, force = false } = opts;
  const existing = await readNamedToggle(weekPageId, DAILY_TREND_RE);

  if (!force && added === 0 && existing) {
    console.log(`⏭️ 신규 기사 없음 — 데일리 급등 스냅샷 유지 (${newsIso})`);
    return;
  }

  const dailyMd = await readDailyMarkdown(weekPageId, newsIso);
  if (!dailyMd) {
    console.log(`⏭️ ${newsIso} 일일 수집본 없음 — 데일리 급등 건너뜀`);
    return;
  }

  const stamp = kstStamp();
  const human = formatKstHuman(newsIso);
  const prompt = dailyTrendingPrompt(stamp, newsIso, human, dailyMd);

  console.log(`🔥 데일리 급등 LLM — ${newsIso}`);
  const raw = await generateWithSearch(prompt);
  const parsed = parseTrendMarkdown(raw, 'dt');
  if (!parsed?.items.length && !parsed?.updatedAt) {
    console.warn('⚠️ 데일리 급등 파싱 실패 — 원문 저장');
  }

  await upsertNamedToggle(
    weekPageId,
    `📈 데일리 급등 · ${newsIso}`,
    raw.trim(),
    DAILY_TREND_RE,
  );
  console.log('✅ 데일리 급등 스냅샷 저장');
}

export async function refreshWeeklyTrend(
  weekPageId: string,
  weekAnchorIso: string,
  opts: { added?: number; force?: boolean; hour?: number } = {},
): Promise<void> {
  const { added = 0, force = false, hour = -1 } = opts;
  const weekId = isoWeekId(weekAnchorIso);
  const existing = await readNamedToggle(weekPageId, WEEKLY_TREND_RE);

  const shouldRefresh = force || added > 0 || hour === 9 || !existing;
  if (!shouldRefresh) {
    console.log(`⏭️ 주간 상위 스냅샷 유지 (${weekId})`);
    return;
  }

  const today = kstToday().iso;
  const fromIso = addIsoDays(today, -(WINDOW_DAYS - 1));
  const logs = await fetchDailyLogsInRange(fromIso, addIsoDays(today, 1));
  if (logs.length === 0) {
    console.log('⏭️ 최근 7일 수집본 없음 — 주간 상위 건너뜀');
    return;
  }

  const markdown = dailiesLogsToMarkdown(logs);
  const dateFrom = logs[0].iso;
  const dateTo = logs[logs.length - 1].iso;
  const stamp = kstStamp();
  const prompt = weeklyTrendingPrompt(stamp, dateFrom, dateTo, markdown, WINDOW_DAYS);

  console.log(`📊 주간 상위 LLM — ${dateFrom}~${dateTo} (${logs.length}일)`);
  const raw = await generateWithSearch(prompt);
  parseTrendMarkdown(raw, 'wt');

  await upsertNamedToggle(
    weekPageId,
    `📈 주간 상위 · ${weekId}`,
    raw.trim(),
    WEEKLY_TREND_RE,
  );
  console.log('✅ 주간 상위 스냅샷 저장');
}

/** 수집 후 트렌드 스냅샷 갱신 (GHA 시간별) */
export async function refreshTrendSnapshots(
  weekPageId: string,
  newsIso: string,
  opts: { added?: number; force?: boolean; hour?: number } = {},
): Promise<void> {
  await refreshDailyTrend(weekPageId, newsIso, opts);
  await refreshWeeklyTrend(weekPageId, newsIso, opts);
}
