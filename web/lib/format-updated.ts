import type { DailyReport, DailyTrendReport, WeeklyReport, WeeklyTrendReport } from './types';

function extractUpdatedTime(raw: string | undefined | null): string | null {
  if (!raw?.trim()) return null;
  const time = raw
    .trim()
    .replace(/^업데이트\s*·\s*/i, '')
    .replace(/\s*·?\s*일일\s*\d+\s*일\s*반영\s*$/i, '')
    .replace(/\s*·\s*검증\s*완료.*$/i, '')
    .split('·')[0]
    ?.trim();
  return time || null;
}

/** "2026-09-14 13:26 KST" → epoch ms (UTC) */
function parseKstStampMs(raw: string): number | null {
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})\s+KST$/i);
  if (!m) return null;
  const [, y, mo, d, hh, mm] = m.map(Number);
  return Date.UTC(y, mo - 1, d, hh - 9, mm);
}

function parseUpdatedMs(raw: string | undefined | null): number | null {
  if (!raw?.trim()) return null;
  const cleaned = extractUpdatedTime(raw) ?? raw.trim();
  const kst = parseKstStampMs(cleaned);
  if (kst != null) return kst;
  const iso = Date.parse(cleaned);
  return Number.isNaN(iso) ? null : iso;
}

function formatKstFromMs(ms: number): string {
  const kst = new Date(ms + 9 * 60 * 60 * 1000);
  const iso = kst.toISOString().slice(0, 10);
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mm = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${iso} ${hh}:${mm} KST`;
}

type PipelineInput = {
  dailies: DailyReport[];
  weeklies: WeeklyReport[];
  dailyTrend: DailyTrendReport | null;
  weeklyTrend: WeeklyTrendReport | null;
};

/** GHA→Notion 흔적(수집·트렌드·주간) 중 가장 최근 시각 */
export function derivePipelineUpdatedMs(input: PipelineInput): number | null {
  const candidates: number[] = [];

  for (const w of input.weeklies) {
    const t = parseUpdatedMs(w.updatedAt);
    if (t != null) candidates.push(t);
  }
  for (const raw of [input.dailyTrend?.updatedAt, input.weeklyTrend?.updatedAt]) {
    const t = parseUpdatedMs(raw);
    if (t != null) candidates.push(t);
  }
  for (const daily of input.dailies) {
    for (const axis of daily.axes) {
      for (const art of axis.articles) {
        if (!art.collectedAt) continue;
        const t = Date.parse(art.collectedAt);
        if (!Number.isNaN(t)) candidates.push(t);
      }
    }
  }

  return candidates.length ? Math.max(...candidates) : null;
}

/** 헤더·대시보드 — GHA 파이프라인 기준 최근 활동 */
export function formatPipelineUpdated(input: PipelineInput): string | null {
  const ms = derivePipelineUpdatedMs(input);
  if (ms == null) return null;
  return `파이프라인 · ${formatKstFromMs(ms)}`;
}

/** 주간 인사이트 본문 **업데이트** 필드 */
export function formatLastUpdated(raw: string | undefined | null): string | null {
  const time = extractUpdatedTime(raw);
  return time ? `업데이트 · ${time}` : null;
}

/** 타임스탬프만 (사이드바 등 짧은 표시) */
export function updatedTimeOnly(raw: string | undefined | null): string | null {
  return extractUpdatedTime(raw);
}

/** 트렌드 스냅샷(Notion) 업데이트 시각 */
export function formatTrendUpdated(raw: string | undefined | null): string | null {
  const time = extractUpdatedTime(raw);
  return time ? `업데이트 · ${time}` : null;
}
