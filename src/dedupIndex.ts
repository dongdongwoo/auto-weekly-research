import fs from 'node:fs/promises';
import path from 'node:path';
import type { KnownItem } from './dedup.js';
import { addIsoDays } from './kst.js';
import { cutoffIso } from './notionRead.js';

const DEDUP_INDEX_FILE = path.join(process.cwd(), 'public/dedup-index.json');

export type DedupIndexFile = {
  generatedAt: string;
  items: KnownItem[];
};

export function knownItemsFromDedupIndex(
  index: DedupIndexFile,
  targetIso: string,
  lookbackDays: number,
  includeTargetDate: boolean,
): KnownItem[] {
  const cutoff = cutoffIso(targetIso, lookbackDays);
  const beforeIso = includeTargetDate ? addIsoDays(targetIso, 1) : targetIso;
  return index.items.filter((item) => item.date >= cutoff && item.date < beforeIso);
}

export async function readDedupIndexFile(): Promise<DedupIndexFile | null> {
  try {
    const raw = await fs.readFile(DEDUP_INDEX_FILE, 'utf8');
    const parsed = JSON.parse(raw) as DedupIndexFile;
    if (!parsed.items?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeDedupIndexFile(index: DedupIndexFile): Promise<void> {
  await fs.mkdir(path.dirname(DEDUP_INDEX_FILE), { recursive: true });
  await fs.writeFile(DEDUP_INDEX_FILE, JSON.stringify(index));
}

/** export 스냅샷의 일일 기사 → dedup-index.json */
export function buildDedupIndexFromDailies(
  dailies: {
    date: string;
    axes: { articles: { headline: string; sources: { url: string }[] }[] }[];
  }[],
  generatedAt: string,
): DedupIndexFile {
  const items: KnownItem[] = [];
  for (const daily of dailies) {
    for (const axis of daily.axes) {
      for (const art of axis.articles) {
        const urls = art.sources.map((s) => s.url).filter(Boolean);
        if (urls.length === 0) {
          items.push({ date: daily.date, url: '', headline: art.headline });
          continue;
        }
        for (const url of urls) {
          items.push({ date: daily.date, url, headline: art.headline });
        }
      }
    }
  }
  return { generatedAt, items };
}
