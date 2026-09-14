import './load-env';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchDashboardData } from './notion-blocks';
import type { DashboardData } from './types';

const TTL_MS = Number(process.env.NOTION_CACHE_SECONDS ?? 1800) * 1000;
const STALE_MS = Number(process.env.NOTION_STALE_SECONDS ?? 86_400) * 1000;
const VERSION = 17;
const CACHE_DIR = path.join(process.cwd(), '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'dashboard.json');
const SNAPSHOT_FILE = path.join(process.cwd(), 'public', 'dashboard.snapshot.json');
const VERSION_FILE = path.join(process.cwd(), 'public', 'dashboard.version.json');
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

function snapshotAgeMs(data: DashboardData): number {
  const t = Date.parse(data.generatedAt);
  return Number.isNaN(t) ? 0 : t;
}

async function readPublicSnapshot(): Promise<DashboardData | null> {
  try {
    const raw = await fs.readFile(SNAPSHOT_FILE, 'utf8');
    const parsed = JSON.parse(raw) as DashboardData;
    if (!parsed.dailies || !parsed.weeklies) return null;
    return parsed;
  } catch {
    return null;
  }
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
  console.warn(`${label} — 캐시된 데이터 사용 (${ageSec}s 전)`);
  cached = entry.v === VERSION ? entry : cached;
  return entry.data;
}

function entryFromSnapshot(data: DashboardData): CacheEntry {
  return { data, at: snapshotAgeMs(data) || Date.now(), v: VERSION };
}

/** Vercel — GHA가 커밋한 public/dashboard.snapshot.json 만 읽음 (Notion API 없음) */
async function loadDashboardProduction(): Promise<DashboardData> {
  if (cached && isFresh(cached)) return cached.data;

  const snapshot = await readPublicSnapshot();
  if (!snapshot) {
    throw new Error(
      'dashboard.snapshot.json 이 없습니다. GHA 파이프라인(export) 실행 후 배포하세요.',
    );
  }

  const entry = entryFromSnapshot(snapshot);
  cached = entry;
  return snapshot;
}

async function buildFromNotion(): Promise<DashboardData> {
  const data = await fetchDashboardData();
  const entry: CacheEntry = { data, at: Date.now(), v: VERSION };
  cached = entry;
  rateLimitedUntil = 0;
  await writeDisk(entry);
  return data;
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
    const snapshot = await readPublicSnapshot();
    if (snapshot) {
      console.warn('Notion 실패 — 로컬 public/dashboard.snapshot.json 사용');
      return entryFromSnapshot(snapshot).data;
    }
    throw e;
  }
}

async function loadDashboardData(): Promise<DashboardData> {
  return IS_VERCEL ? loadDashboardProduction() : loadDashboardDev();
}

/** dev: Notion live · Vercel: GHA 스냅샷 JSON */
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

/** GHA export:dashboard — snapshot + 클라이언트 폴링용 version 파일 */
export async function exportDashboardSnapshot(): Promise<DashboardData> {
  const data = await fetchDashboardData();
  await fs.mkdir(path.dirname(SNAPSHOT_FILE), { recursive: true });
  await fs.writeFile(SNAPSHOT_FILE, JSON.stringify(data));
  await fs.writeFile(
    VERSION_FILE,
    JSON.stringify({ generatedAt: data.generatedAt, v: VERSION }),
  );
  return data;
}
