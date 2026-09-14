import './load-env';
import fs from 'node:fs/promises';
import path from 'node:path';
import { analyzeDailyTrend } from './daily-trend-llm';
import { analyzeWeeklyTrend } from './weekly-trend-llm';
import { fetchDashboardData } from './notion-blocks';
import type { DailyReport, DailyTrendReport, DashboardData, WeeklyTrendReport } from './types';

const TTL_MS = Number(process.env.NOTION_CACHE_SECONDS ?? 1800) * 1000;
const STALE_MS = Number(process.env.NOTION_STALE_SECONDS ?? 86_400) * 1000;
const WEEKLY_TTL_MS = Number(process.env.WEEKLY_TREND_CACHE_SECONDS ?? 86400) * 1000;
const WINDOW_DAYS = 7;
const VERSION = 13;
const CACHE_DIR = process.env.VERCEL
  ? path.join('/tmp', 'research-dashboard-cache')
  : path.join(process.cwd(), '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'dashboard.json');
const IS_DEV = process.env.NODE_ENV === 'development';

type CacheEntry = {
  data: DashboardData;
  at: number;
  v: number;
  weeklyTrendAt: number;
};

let cached: CacheEntry | null = null;
let inflight: Promise<DashboardData> | null = null;
let backgroundRefresh: Promise<void> | null = null;
let rateLimitedUntil = 0;

function isFresh(entry: CacheEntry) {
  return entry.v === VERSION && Date.now() - entry.at < TTL_MS;
}

function isUsableStale(entry: CacheEntry) {
  return entry.v === VERSION && Date.now() - entry.at < STALE_MS;
}

function isWeeklyFresh(weeklyTrendAt: number) {
  return weeklyTrendAt > 0 && Date.now() - weeklyTrendAt < WEEKLY_TTL_MS;
}

function isRateLimited(e: unknown) {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: string }).code === 'rate_limited'
  );
}

async function readDisk(): Promise<CacheEntry | null> {
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as CacheEntry;
    if (parsed.v !== VERSION || !parsed.data) return null;
    return { ...parsed, weeklyTrendAt: parsed.weeklyTrendAt ?? 0 };
  } catch {
    return null;
  }
}

/** rate limit·버전 불일치 시에도 fallback 용 */
async function readDiskAny(): Promise<CacheEntry | null> {
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as CacheEntry;
    if (!parsed.data) return null;
    return { ...parsed, weeklyTrendAt: parsed.weeklyTrendAt ?? 0 };
  } catch {
    return null;
  }
}

async function writeDisk(entry: CacheEntry) {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(entry));
  } catch (e) {
    console.warn('디스크 캐시 저장 실패 —', e instanceof Error ? e.message : e);
  }
}

function useStale(label: string, entry: CacheEntry) {
  const ageSec = Math.round((Date.now() - entry.at) / 1000);
  console.warn(`Notion ${label} — 캐시된 데이터 사용 (${ageSec}s 전)`);
  cached = entry.v === VERSION ? entry : cached;
  return entry.data;
}

function todayDaily(dailies: DailyReport[]) {
  return dailies[0]?.articleCount ? dailies[0] : null;
}

async function attachDailyTrend(
  data: DashboardData,
  staleTrend: DailyTrendReport | null | undefined,
): Promise<DashboardData> {
  const today = todayDaily(data.dailies);
  if (!today) return { ...data, dailyTrend: null };

  try {
    const dailyTrend = await analyzeDailyTrend(today);
    return { ...data, dailyTrend };
  } catch (e) {
    console.warn(
      '데일리 급등 LLM 실패 —',
      e instanceof Error ? e.message : e,
      staleTrend ? '(이전 분석 유지)' : '',
    );
    return { ...data, dailyTrend: staleTrend ?? null };
  }
}

async function attachWeeklyTrend(
  data: DashboardData,
  staleTrend: WeeklyTrendReport | null | undefined,
  weeklyTrendAt: number,
): Promise<{ data: DashboardData; weeklyTrendAt: number }> {
  const hasArticles = data.dailies.slice(0, WINDOW_DAYS).some((d) => d.articleCount > 0);
  if (!hasArticles) {
    return { data: { ...data, weeklyTrend: null }, weeklyTrendAt: 0 };
  }

  if (isWeeklyFresh(weeklyTrendAt) && staleTrend?.items.length) {
    return { data: { ...data, weeklyTrend: staleTrend }, weeklyTrendAt };
  }

  try {
    const weeklyTrend = await analyzeWeeklyTrend(data.dailies, WINDOW_DAYS);
    return {
      data: { ...data, weeklyTrend },
      weeklyTrendAt: weeklyTrend ? Date.now() : weeklyTrendAt,
    };
  } catch (e) {
    console.warn(
      '주간 상위 LLM 실패 —',
      e instanceof Error ? e.message : e,
      staleTrend ? '(이전 분석 유지)' : '',
    );
    return {
      data: { ...data, weeklyTrend: staleTrend ?? null },
      weeklyTrendAt: staleTrend ? weeklyTrendAt : 0,
    };
  }
}

async function buildFromNotion(staleDisk: CacheEntry | null): Promise<DashboardData> {
  const notionData = await fetchDashboardData();
  const staleDaily = staleDisk?.data.dailyTrend ?? cached?.data.dailyTrend;
  const staleWeekly = staleDisk?.data.weeklyTrend ?? cached?.data.weeklyTrend;
  let weeklyTrendAt = staleDisk?.weeklyTrendAt ?? cached?.weeklyTrendAt ?? 0;

  const withDaily = await attachDailyTrend(notionData, staleDaily);
  const weeklyResult = await attachWeeklyTrend(withDaily, staleWeekly, weeklyTrendAt);
  const data = weeklyResult.data;
  weeklyTrendAt = weeklyResult.weeklyTrendAt;

  const entry: CacheEntry = { data, at: Date.now(), v: VERSION, weeklyTrendAt };
  cached = entry;
  rateLimitedUntil = 0;
  await writeDisk(entry);
  return data;
}

async function loadDashboardData(): Promise<DashboardData> {
  const disk = await readDisk();
  if (disk && isFresh(disk)) {
    cached = disk;
    return disk.data;
  }

  const staleDisk = disk ?? (await readDiskAny());

  if (Date.now() < rateLimitedUntil && staleDisk) {
    return useStale('rate limit cooldown', staleDisk);
  }

  // dev: 만료 캐시라도 즉시 반환 + 백그라운드 갱신 (HMR·연속 새로고침 시 Notion 폭주 방지)
  if (IS_DEV && staleDisk && isUsableStale(staleDisk)) {
    cached = staleDisk.v === VERSION ? staleDisk : cached;
    if (!backgroundRefresh) {
      backgroundRefresh = buildFromNotion(staleDisk)
        .then(() => undefined)
        .catch((e) => {
          if (isRateLimited(e)) {
            rateLimitedUntil = Date.now() + 90_000;
            console.warn('Notion rate limit — 백그라운드 갱신 중단, 캐시 유지');
          } else {
            console.warn('Notion 백그라운드 갱신 실패 —', e instanceof Error ? e.message : e);
          }
        })
        .finally(() => {
          backgroundRefresh = null;
        });
    }
    return staleDisk.data;
  }

  try {
    return await buildFromNotion(staleDisk);
  } catch (e) {
    if (isRateLimited(e)) {
      rateLimitedUntil = Date.now() + 90_000;
      if (cached?.v === VERSION) return useStale('rate limit', cached);
      if (staleDisk) return useStale('rate limit', staleDisk);
    }
    throw e;
  }
}

/** 메모리 + 디스크 캐시. dev HMR 후에도 .cache/ 로 Notion 재호출 방지 */
export function getCachedDashboardData(): Promise<DashboardData> {
  if (cached && isFresh(cached)) {
    return Promise.resolve(cached.data);
  }
  if (inflight) return inflight;

  inflight = loadDashboardData().finally(() => {
    inflight = null;
  });

  return inflight;
}
