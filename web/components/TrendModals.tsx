import type { DailyTrendItem } from '@/lib/types';
import type { TrendingStory } from '@/lib/trending';
import { SourceLinks } from './SourceLinks';

function formatDay(iso: string) {
  const [, m, d] = iso.split('-');
  return `${Number(m)}.${Number(d)}`;
}

function WeeklyModal({ story }: { story: TrendingStory }) {
  return (
    <dialog className="trend-dialog" id={`trend-modal-${story.id}`}>
      <div className="trend-dialog-inner">
        <header className="trend-dialog-head">
          <p className="trend-dialog-kicker">{story.axisLabel}</p>
          <h3 className="trend-dialog-title">{story.headline}</h3>
          <p className="trend-dialog-meta">
            {story.articleCount}편 · {story.sourceCount}매체
            {story.daySpan > 1 ? ` · ${story.daySpan}일` : ''}
          </p>
        </header>
        <div className="trend-dialog-body">
          {story.articles.map((a) => (
            <article key={a.id} className="trend-dialog-article">
              <p className="trend-dialog-article-meta">
                {formatDay(a.date)} · {a.axis}
              </p>
              <h4 className="trend-dialog-article-title">{a.headline}</h4>
              {a.summary ? <p className="trend-dialog-text">{a.summary}</p> : null}
              {a.analysis ? <p className="trend-dialog-text muted">{a.analysis}</p> : null}
              <SourceLinks sources={a.sources} />
            </article>
          ))}
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

function DailyModal({ item }: { item: DailyTrendItem }) {
  return (
    <dialog className="trend-dialog" id={`trend-modal-${item.id}`}>
      <div className="trend-dialog-inner">
        <header className="trend-dialog-head">
          <div className="trend-dialog-badges">
            {item.rising ? <span className="trend-badge up">UP</span> : null}
            <span className="trend-dialog-meta">
              보도 {item.coverageCount}편 · SNS {item.mentionCount}회
            </span>
          </div>
          <h3 className="trend-dialog-title">{item.headline}</h3>
        </header>
        <div className="trend-dialog-body">
          {item.summary ? <p className="trend-dialog-text">{item.summary}</p> : null}
          {item.sources.length ? (
            <div className="trend-dialog-refs">
              <p className="trend-dialog-label">근거</p>
              <SourceLinks sources={item.sources} />
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
}: {
  weekly: TrendingStory[];
  daily: DailyTrendItem[];
}) {
  return (
    <>
      {weekly.map((s) => (
        <WeeklyModal key={s.id} story={s} />
      ))}
      {daily.map((item) => (
        <DailyModal key={item.id} item={item} />
      ))}
    </>
  );
}
