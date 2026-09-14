import './load-env';
import { unstable_cache } from 'next/cache';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchDashboardData } from './notion-blocks';
import type { DashboardData } from './types';

const TTL_MS = Number(process.env.NOTION_CACHE_SECONDS ?? 1800) * 1000;
const STALE_MS = Number(process.env.NOTION_STALE_SECONDS ?? 86_400) * 1000;
const REVALIDATE_SEC = Math.max(60, Number(process.env.NOTION_CACHE_SECONDS ?? 1800));
const VERSION = 15;
const CACHE_DIR = process.env.VERCEL
  ? path.join('/tmp', 'research-dashboard-cache')
  : path.join(process.cwd(), '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'dashboard.json');
const IS_DEV = process.env.NODE_ENV === 'development';
const IS_VERCEL = !!process.env.VERCEL;

type CacheEntry = {
  data: DashboardData;
  at: number;
  v: number;
};

let cached: CacheEntry | null = null;
let inflight: Promise<DashboardData> | null = null;
let backgroundRefresh: Promise<void> | null = null;
let rateLimitedUntil = 0;

const getPlatformCached = unstable_cache(
  async () => fetchDashboardData(),
  ['notion-dashboard', String(VERSION)],
  { revalidate: REVALIDATE_SEC },
);

function isFresh(entry: CacheEntry) {
  return entry.v === VERSION && Date.now() - entry.at < TTL_MS;
}

function isUsableStale(entry: CacheEntry) {
  return entry.v === VERSION && Date.now() - entry.at < STALE_MS;
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

async function readDiskAny(): Promise<CacheEntry | null> {
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as CacheEntry;
    if (!parsed.data) return null;
    return parsed;
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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('notion_fetch_timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

async function fetchNotionData(): Promise<DashboardData> {
  const source = IS_VERCEL ? getPlatformCached() : fetchDashboardData();
  if (!IS_VERCEL) return source;
  return withTimeout(source, 9000);
}

async function buildFromNotion(): Promise<DashboardData> {
  const data = await fetchNotionData();
  const entry: CacheEntry = { data, at: Date.now(), v: VERSION };
  cached = entry;
  rateLimitedUntil = 0;
  await writeDisk(entry);
  return data;
}

async function loadDashboardProduction(): Promise<DashboardData> {
  const disk = await readDisk();
  if (disk && isFresh(disk)) {
    cached = disk;
    return disk.data;
  }

  const staleDisk = disk ?? (await readDiskAny());

  if (Date.now() < rateLimitedUntil && staleDisk) {
    return useStale('rate limit cooldown', staleDisk);
  }

  try {
    return await buildFromNotion();
  } catch (e) {
    if (isRateLimited(e)) {
      rateLimitedUntil = Date.now() + 90_000;
      if (cached?.v === VERSION) return useStale('rate limit', cached);
      if (staleDisk) return useStale('rate limit', staleDisk);
    }
    if (staleDisk?.data) {
      return useStale(
        e instanceof Error && e.message === 'notion_fetch_timeout' ? 'timeout' : 'fetch failed',
        staleDisk,
      );
    }
    throw e;
  }
}

async function loadDashboardDev(): Promise<DashboardData> {
  const disk = await readDisk();
  if (disk && isFresh(disk)) {
    cached = disk;
    return disk.data;
  }

  const staleDisk = disk ?? (await readDiskAny());

  if (Date.now() < rateLimitedUntil && staleDisk) {
    return useStale('rate limit cooldown', staleDisk);
  }

  if (staleDisk && isUsableStale(staleDisk)) {
    cached = staleDisk.v === VERSION ? staleDisk : cached;
    if (!backgroundRefresh) {
      backgroundRefresh = buildFromNotion()
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
    return await buildFromNotion();
  } catch (e) {
    if (isRateLimited(e)) {
      rateLimitedUntil = Date.now() + 90_000;
      if (cached?.v === VERSION) return useStale('rate limit', cached);
      if (staleDisk) return useStale('rate limit', staleDisk);
    }
    throw e;
  }
}

async function loadDashboardData(): Promise<DashboardData> {
  return IS_DEV ? loadDashboardDev() : loadDashboardProduction();
}

/** 메모리 + 디스크 + (Vercel) Next Data Cache. 트렌드는 GHA→Notion 스냅샷을 그대로 읽는다 */
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
