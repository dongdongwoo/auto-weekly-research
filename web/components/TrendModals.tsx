import type { DailyReport, DailyTrendItem } from '@/lib/types';
import { findRelatedArticles, type TrendArticleView } from '@/lib/trend-articles';
import { SourceLinks } from './SourceLinks';

function formatArticleDate(iso: string) {
  const [, m, d] = iso.split('-');
  return `${Number(m)}.${Number(d)}`;
}

function TrendArticleBlock({ article }: { article: TrendArticleView }) {
  return (
    <article className="trend-dialog-article">
      <p className="trend-dialog-article-meta">
        {formatArticleDate(article.date)} · {article.axis}
      </p>
      <h4 className="trend-dialog-article-title">{article.headline}</h4>
      {article.summary ? <p className="trend-dialog-text">{article.summary}</p> : null}
      {article.analysis ? (
        <p className="trend-dialog-text muted">{article.analysis}</p>
      ) : null}
      {article.sources.length ? (
        <div className="trend-dialog-refs">
          <p className="trend-dialog-label">출처</p>
          <SourceLinks sources={article.sources} />
        </div>
      ) : null}
    </article>
  );
}

function TrendModal({
  item,
  showUp,
  dailies,
  dailyOnly,
}: {
  item: DailyTrendItem;
  showUp: boolean;
  dailies: DailyReport[];
  dailyOnly?: boolean;
}) {
  const related = dailyOnly ? [] : findRelatedArticles(dailies, item);
  const linkSources = dailyOnly
    ? item.sources
    : related.length
      ? item.sources.filter(
          (s) => !related.some((a) => a.sources.some((as) => as.url === s.url)),
        )
      : item.sources;

  return (
    <dialog className="trend-dialog" id={`trend-modal-${item.id}`}>
      <div className="trend-dialog-inner">
        <header className="trend-dialog-head">
          <div className="trend-dialog-badges">
            {showUp && item.rising ? <span className="trend-badge up">UP</span> : null}
            <span className="trend-dialog-meta">
              {dailyOnly || showUp
                ? `보도 ${item.coverageCount}편 · SNS ${item.mentionCount}회`
                : `보도 ${item.coverageCount}편`}
            </span>
          </div>
          <h3 className="trend-dialog-title">{item.headline}</h3>
        </header>
        <div className="trend-dialog-body">
          {item.summary ? <p className="trend-dialog-text">{item.summary}</p> : null}
          {related.map((article) => (
            <TrendArticleBlock key={article.id} article={article} />
          ))}
          {linkSources.length ? (
            <div className="trend-dialog-refs">
              <p className="trend-dialog-label">
                {dailyOnly ? '출처' : related.length ? '추가 근거' : '근거'}
              </p>
              <SourceLinks sources={linkSources} />
            </div>
          ) : null}
        </div>
        <footer className="trend-dialog-foot">
          <button type="button" className="trend-dialog-close" data-trend-close>
            닫기
          </button>
        </footer>
      </div>
    </dialog>
  );
}

export function TrendModals({
  weekly,
  daily,
  weeklyDailies,
  dailyDailies,
}: {
  weekly: DailyTrendItem[];
  daily: DailyTrendItem[];
  weeklyDailies: DailyReport[];
  dailyDailies: DailyReport[];
}) {
  return (
    <>
      {weekly.map((item) => (
        <TrendModal key={item.id} item={item} showUp={false} dailies={weeklyDailies} />
      ))}
      {daily.map((item) => (
        <TrendModal
          key={item.id}
          item={item}
          showUp
          dailies={dailyDailies}
          dailyOnly
        />
      ))}
    </>
  );
}
