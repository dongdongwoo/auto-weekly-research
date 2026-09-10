import type { Article, DailyReport, DailyTrendItem } from './types';

export type TrendArticleView = Article & { date: string; axis: string };

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname.replace(/\/$/, '')}`;
  } catch {
    return url.split('?')[0] ?? url;
  }
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2),
  );
}

/** LLM 트렌드 이슈 ↔ 수집 기사 매칭 (출처 URL · 헤드라인 토큰) */
export function findRelatedArticles(
  dailies: DailyReport[],
  item: DailyTrendItem,
  limit = 5,
): TrendArticleView[] {
  const trendUrls = new Set(
    item.sources.map((s) => normalizeUrl(s.url)).filter((u) => u && u !== '#'),
  );
  const headlineTokens = tokenize(item.headline);
  const scored: { article: TrendArticleView; score: number }[] = [];

  for (const daily of dailies) {
    for (const axis of daily.axes) {
      for (const art of axis.articles) {
        let score = 0;
        for (const s of art.sources) {
          if (trendUrls.has(normalizeUrl(s.url))) score += 10;
        }
        const artTokens = tokenize(art.headline);
        for (const t of headlineTokens) {
          if (artTokens.has(t)) score += 2;
        }
        if (score > 0) {
          scored.push({
            article: { ...art, date: daily.date, axis: axis.name },
            score,
          });
        }
      }
    }
  }

  scored.sort((a, b) => b.score - a.score || b.article.date.localeCompare(a.article.date));

  const seen = new Set<string>();
  const out: TrendArticleView[] = [];
  for (const { article } of scored) {
    if (seen.has(article.id)) continue;
    seen.add(article.id);
    out.push(article);
    if (out.length >= limit) break;
  }
  return out;
}
