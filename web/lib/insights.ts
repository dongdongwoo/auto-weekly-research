import type { DailyReport, DailyTrendReport } from './types';
import { buildTrendingStories, type TrendingStory } from './trending';

export type FlatArticle = {
  id: string;
  headline: string;
  summary: string;
  analysis: string;
  sources: { label: string; url: string }[];
  axis: string;
  date: string;
  weekId: string;
  collectedAt?: string;
};

export type AxisSlice = {
  key: string;
  label: string;
  count: number;
  pct: number;
  color: string;
};

export type { TrendingStory };

export type HeatmapCell = {
  date: string;
  label: string;
  count: number;
};

export type HeatmapAxisRow = {
  key: string;
  label: string;
  color: string;
  cells: HeatmapCell[];
  total: number;
};

export type AxisHeatmapData = {
  dates: HeatmapCell[];
  rows: HeatmapAxisRow[];
  maxCell: number;
};

export type AxisMomentum = {
  key: string;
  label: string;
  color: string;
  recent: number;
  prev: number;
  delta: number;
};

export type TimelineItem = {
  id: string;
  date: string;
  dayLabel: string;
  headline: string;
  axisKey: string;
  axisLabel: string;
  color: string;
};

export type OverviewStats = {
  windowDays: number;
  totalRecent: number;
  prevTotal: number;
  pctChange: number;
  activeDays: number;
  topAxis: AxisSlice | null;
  axisMix: AxisSlice[];
  axisMomentum: AxisMomentum[];
  trendingWeekly: TrendingStory[];
  trendingDaily: TrendingStory[];
  dailyTrend: DailyTrendReport | null;
  dailyArticleCount: number;
  heatmap: AxisHeatmapData;
  timeline: TimelineItem[];
};

export const AXIS_PALETTE = [
  { key: 'crypto', label: '크립토', color: '#4f46e5' },
  { key: 'stock', label: '상장주식', color: '#2563eb' },
  { key: 'tradfi', label: 'TradFi', color: '#7c3aed' },
  { key: 'rwa', label: 'RWA', color: '#0d9488' },
  { key: 'ai', label: 'AI×금융', color: '#0891b2' },
  { key: 'globalreg', label: '해외 규제', color: '#ea580c' },
  { key: 'krreg', label: '국내 규제', color: '#dc2626' },
  { key: 'krsec', label: '국내 증권', color: '#db2777' },
  { key: 'partner', label: '파트너십', color: '#059669' },
  { key: 'other', label: '기타', color: '#a8a29e' },
] as const;

const AXIS_MATCH = [
  { key: 'krreg', label: '국내 규제', match: '국내 규제' },
  { key: 'globalreg', label: '해외 규제', match: '해외 규제' },
  { key: 'krsec', label: '국내 증권', match: '국내 증권' },
  { key: 'partner', label: '파트너십', match: '파트너십' },
  { key: 'rwa', label: 'RWA 토큰화', match: 'RWA' },
  { key: 'stock', label: '상장주식', match: '상장주식' },
  { key: 'tradfi', label: 'TradFi', match: 'TradFi' },
  { key: 'ai', label: 'AI × 금융', match: 'AI' },
  { key: 'crypto', label: '크립토 구조', match: '크립토' },
] as const;

function axisKey(axis: string) {
  return AXIS_MATCH.find((a) => axis.includes(a.match))?.key ?? 'other';
}

function axisMeta(key: string) {
  return AXIS_PALETTE.find((a) => a.key === key) ?? AXIS_PALETTE[AXIS_PALETTE.length - 1];
}

function parseDay(iso: string) {
  return Date.parse(`${iso}T12:00:00`);
}

function shortDay(iso: string) {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

function inWindow(articles: FlatArticle[], endDate: string, startOffset: number, endOffset: number) {
  const end = parseDay(endDate);
  const startMs = end - startOffset * 86400000;
  const endMs = end - endOffset * 86400000;
  return articles.filter((a) => {
    const t = parseDay(a.date);
    return t > startMs && t <= endMs;
  });
}

function countByAxis(articles: FlatArticle[]) {
  const counts = new Map<string, number>();
  for (const a of articles) {
    const k = axisKey(a.axis);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

function toAxisMix(counts: Map<string, number>, total: number): AxisSlice[] {
  return AXIS_PALETTE.map((ax) => {
    const count = counts.get(ax.key) ?? 0;
    return {
      key: ax.key,
      label: ax.label,
      count,
      pct: total ? Math.round((count / total) * 100) : 0,
      color: ax.color,
    };
  })
    .filter((a) => a.count > 0)
    .sort((a, b) => b.count - a.count);
}

export function buildOverviewStats(
  articles: FlatArticle[],
  dailies: DailyReport[],
  windowDays = 7,
  dailyTrend: DailyTrendReport | null = null,
): OverviewStats {
  const latestDate = dailies[0]?.date ?? articles[0]?.date ?? '';
  const recent = latestDate
    ? inWindow(articles, latestDate, windowDays, 0)
    : articles.slice(0, 40);
  const prev = latestDate
    ? inWindow(articles, latestDate, windowDays * 2, windowDays)
    : [];

  const recentCounts = countByAxis(recent);
  const prevCounts = countByAxis(prev);
  const totalRecent = recent.length;
  const prevTotal = prev.length;
  const axisMix = toAxisMix(recentCounts, totalRecent || 1);

  const axisMomentum: AxisMomentum[] = AXIS_PALETTE.map((ax) => {
    const r = recentCounts.get(ax.key) ?? 0;
    const p = prevCounts.get(ax.key) ?? 0;
    return { key: ax.key, label: ax.label, color: ax.color, recent: r, prev: p, delta: r - p };
  })
    .filter((a) => a.recent > 0 || a.prev > 0)
    .sort((a, b) => b.recent - a.recent || b.delta - a.delta);

  const trendingWeekly = buildTrendingStories(recent, prev, axisMeta, axisKey, 5, 'weekly');

  const todayIso = dailies[0]?.date ?? latestDate;
  const yesterdayIso = dailies.find((d) => d.date < todayIso)?.date;
  const todayArticles = todayIso ? articles.filter((a) => a.date === todayIso) : [];
  const yesterdayArticles = yesterdayIso ? articles.filter((a) => a.date === yesterdayIso) : [];
  const trendingDaily = buildTrendingStories(
    todayArticles,
    yesterdayArticles,
    axisMeta,
    axisKey,
    5,
    'daily',
  );

  const heatmapDays = dailies.slice(0, windowDays).reverse();
  const dates: HeatmapCell[] = heatmapDays.map((d) => ({
    date: d.date,
    label: shortDay(d.date),
    count: 0,
  }));

  const heatmapAxes = AXIS_PALETTE.filter((a) => a.key !== 'other');
  const rows: HeatmapAxisRow[] = heatmapAxes
    .map((ax) => {
      const cells = heatmapDays.map((d) => ({
        date: d.date,
        label: shortDay(d.date),
        count: articles.filter((a) => a.date === d.date && axisKey(a.axis) === ax.key).length,
      }));
      const total = cells.reduce((s, c) => s + c.count, 0);
      return { key: ax.key, label: ax.label, color: ax.color, cells, total };
    })
    .filter((r) => r.total > 0);

  const maxCell = Math.max(1, ...rows.flatMap((r) => r.cells.map((c) => c.count)));

  const activeDays = heatmapDays.filter((d) =>
    articles.some((a) => a.date === d.date),
  ).length;
  const pctChange =
    prevTotal === 0 ? (totalRecent > 0 ? 100 : 0) : Math.round(((totalRecent - prevTotal) / prevTotal) * 100);

  const timeline: TimelineItem[] = recent.slice(0, 10).map((a) => {
    const meta = axisMeta(axisKey(a.axis));
    return {
      id: a.id,
      date: a.date,
      dayLabel: shortDay(a.date),
      headline: a.headline,
      axisKey: meta.key,
      axisLabel: meta.label,
      color: meta.color,
    };
  });

  return {
    windowDays,
    totalRecent,
    prevTotal,
    pctChange,
    activeDays,
    topAxis: axisMix[0] ?? null,
    axisMix,
    axisMomentum,
    trendingWeekly,
    trendingDaily,
    dailyTrend,
    dailyArticleCount: todayArticles.length,
    heatmap: { dates, rows, maxCell },
    timeline,
  };
}
