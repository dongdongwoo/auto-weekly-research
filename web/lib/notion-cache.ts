import './load-env';
import fs from 'node:fs/promises';
import path from 'node:path';
import { analyzeDailyTrend } from './daily-trend-llm';
import { fetchDashboardData } from './notion-blocks';
import type { DailyReport, DailyTrendReport, DashboardData } from './types';

const TTL_MS = Number(process.env.NOTION_CACHE_SECONDS ?? 1800) * 1000;
const VERSION = 12;
const CACHE_DIR = path.join(process.cwd(), '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'dashboard.json');

type CacheEntry = { data: DashboardData; at: number; v: number };

let cached: CacheEntry | null = null;
let inflight: Promise<DashboardData> | null = null;

function isFresh(entry: CacheEntry) {
  return entry.v === VERSION && Date.now() - entry.at < TTL_MS;
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
    return parsed;
  } catch {
    return null;
  }
}

async function writeDisk(entry: CacheEntry) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(entry));
}

function useStale(label: string, entry: CacheEntry) {
  console.warn(`Notion ${label} — 캐시된 데이터 사용 (${Math.round((Date.now() - entry.at) / 1000)}s 전)`);
  cached = entry;
  return entry.data;
}

function todayDaily(dailies: DailyReport[]) {
  return dailies[0]?.articleCount ? dailies[0] : null;
}

/** Notion fetch 후 오늘 수집본으로 데일리 급등 LLM (수집 파이프라인과 분리) */
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

/** 메모리 + 디스크 캐시. dev HMR 후에도 .cache/ 로 Notion 재호출 방지 */
export function getCachedDashboardData(): Promise<DashboardData> {
  if (cached && isFresh(cached)) {
    return Promise.resolve(cached.data);
  }
  if (inflight) return inflight;

  inflight = (async () => {
    const disk = await readDisk();
    if (disk && isFresh(disk)) {
      cached = disk;
      return disk.data;
    }

    try {
      const notionData = await fetchDashboardData();
      const staleTrend = disk?.data.dailyTrend ?? cached?.data.dailyTrend;
      const data = await attachDailyTrend(notionData, staleTrend);
      const entry: CacheEntry = { data, at: Date.now(), v: VERSION };
      cached = entry;
      await writeDisk(entry);
      return data;
    } catch (e) {
      if (isRateLimited(e)) {
        if (cached?.v === VERSION) return useStale('rate limit', cached);
        if (disk) return useStale('rate limit', disk);
      }
      throw e;
    }
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}
