import type { FlatArticle } from './insights';

export type TrendArticleRef = {
  id: string;
  headline: string;
  summary: string;
  analysis: string;
  date: string;
  axis: string;
  sources: { label: string; url: string }[];
};

export type TrendingStory = {
  id: string;
  headline: string;
  articleCount: number;
  sourceCount: number;
  daySpan: number;
  score: number;
  rising: boolean;
  hot: boolean;
  prevCount: number;
  axisLabel: string;
  color: string;
  leadArticleId: string;
  articles: TrendArticleRef[];
};

function normalizeHeadline(text: string) {
  return text
    .toLowerCase()
    .replace(/\*\*/g, '')
    .replace(/[^\w\s가-힣]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSimilarHeadline(a: string, b: string) {
  const na = normalizeHeadline(a);
  const nb = normalizeHeadline(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length > nb.length ? na : nb;
  if (shorter.length < 14) return false;
  return longer.includes(shorter);
}

const ENTITIES = [
  'Robinhood',
  'Coinbase',
  'Circle',
  'Consensys',
  'MetaMask',
  'Ethereum',
  'SEC',
  'CFTC',
  'BlackRock',
  'Ondo',
  'Binance',
  'Swift',
  'LSEG',
  'tZERO',
  '금융위',
  '금감원',
  'MiCA',
  'USDC',
  'USDT',
];

function storyKeys(text: string) {
  const keys = new Set<string>();
  const lower = text.toLowerCase();
  for (const ent of ENTITIES) {
    if (lower.includes(ent.toLowerCase())) keys.add(ent.toLowerCase());
  }
  for (const m of text.matchAll(/\b[A-Z][a-zA-Z]{2,}\b/g)) {
    keys.add(m[0].toLowerCase());
  }
  for (const m of text.matchAll(/[가-힣]{3,}/g)) {
    const t = m[0];
    if (!/^(통해|대한|관련|이번|발표|출시|기준|보도|분석|요약)$/.test(t)) keys.add(t);
  }
  return [...keys];
}

function sameStory(a: FlatArticle, b: FlatArticle) {
  if (isSimilarHeadline(a.headline, b.headline)) return true;
  const ka = storyKeys(`${a.headline} ${a.summary}`);
  const kb = storyKeys(`${b.headline} ${b.summary}`);
  const overlap = ka.filter((k) => kb.includes(k));
  return overlap.length >= 3;
}

function clusterArticles(articles: FlatArticle[]) {
  const clusters: FlatArticle[][] = [];
  for (const article of articles) {
    const idx = clusters.findIndex((c) => c.some((x) => sameStory(x, article)));
    if (idx >= 0) clusters[idx].push(article);
    else clusters.push([article]);
  }
  return clusters;
}

function pickHeadline(articles: FlatArticle[]) {
  return [...articles].sort((a, b) => b.headline.length - a.headline.length)[0].headline;
}

type TrendingMode = 'weekly' | 'daily';

function buildStory(
  articles: FlatArticle[],
  axisMeta: (key: string) => { label: string; color: string },
  axisKey: (axis: string) => string,
  prevCount = 0,
  mode: TrendingMode = 'weekly',
  storyId: string,
): TrendingStory {
  const sources = new Set<string>();
  for (const a of articles) {
    for (const s of a.sources) {
      if (s.label) sources.add(s.label);
    }
  }
  const dates = new Set(articles.map((a) => a.date));
  const articleCount = articles.length;
  const sourceCount = sources.size;
  const daySpan = dates.size;
  const score = articleCount * 4 + sourceCount * 2 + (daySpan > 1 ? daySpan : 0);
  const rising =
    mode === 'daily'
      ? articleCount >= 2 && (prevCount === 0 || articleCount > prevCount)
      : articleCount >= 2 &&
        (prevCount === 0 || articleCount >= prevCount + 1 || articleCount >= prevCount * 1.5);
  const hot =
    mode === 'daily'
      ? articleCount >= 2 || sourceCount >= 2
      : articleCount >= 3 || sourceCount >= 3 || (articleCount >= 2 && daySpan >= 2);

  const axisCounts = new Map<string, number>();
  for (const a of articles) {
    const k = axisKey(a.axis);
    axisCounts.set(k, (axisCounts.get(k) ?? 0) + 1);
  }
  const topAxis = [...axisCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'other';
  const meta = axisMeta(topAxis);
  const lead = [...articles].sort((a, b) => b.date.localeCompare(a.date))[0];

  return {
    id: storyId,
    headline: pickHeadline(articles),
    articleCount,
    sourceCount,
    daySpan,
    score,
    rising,
    hot,
    prevCount,
    axisLabel: meta.label,
    color: meta.color,
    leadArticleId: lead.id,
    articles: articles.map((a) => ({
      id: a.id,
      headline: a.headline,
      summary: a.summary,
      analysis: a.analysis,
      date: a.date,
      axis: a.axis,
      sources: a.sources,
    })),
  };
}

function matchPrevCount(cluster: FlatArticle[], prevClusters: FlatArticle[][]) {
  let best = 0;
  for (const prev of prevClusters) {
    if (cluster.some((a) => prev.some((p) => sameStory(a, p)))) {
      best = Math.max(best, prev.length);
    }
  }
  return best;
}

export function buildTrendingStories(
  recent: FlatArticle[],
  prev: FlatArticle[],
  axisMeta: (key: string) => { label: string; color: string },
  axisKey: (axis: string) => string,
  limit = 6,
  mode: TrendingMode = 'weekly',
): TrendingStory[] {
  const recentClusters = clusterArticles(recent);
  const prevClusters = clusterArticles(prev);

  const stories = recentClusters
    .map((c, i) =>
      buildStory(c, axisMeta, axisKey, matchPrevCount(c, prevClusters), mode, `${mode}-${i}`),
    )
    .sort((a, b) => b.score - a.score || b.articleCount - a.articleCount);

  const minArticles = 2;
  const filtered = stories.filter(
    (s) => s.hot || s.rising || s.articleCount >= minArticles,
  );
  const pick = filtered.length > 0 ? filtered : stories;

  return pick.slice(0, limit);
}
