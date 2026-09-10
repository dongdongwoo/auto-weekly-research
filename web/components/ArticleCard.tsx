import type { Article } from '@/lib/types';

export function ArticleRow({
  article,
  date,
  inputId,
  name,
  defaultChecked,
  haystack,
  weekId,
  axisKey,
  dateKey,
  pageKey,
}: {
  article: Article;
  date?: string;
  inputId: string;
  name: string;
  defaultChecked?: boolean;
  haystack: string;
  weekId?: string;
  axisKey?: string;
  dateKey?: string;
  pageKey?: string;
}) {
  return (
    <label
      className="row"
      htmlFor={inputId}
      data-s={haystack}
      data-week-id={weekId}
      data-ax={axisKey}
      data-date={dateKey}
      data-page={pageKey}
    >
      <input
        className="sr"
        type="radio"
        name={name}
        id={inputId}
        defaultChecked={defaultChecked}
      />
      <div className="meta">
        {date && <span>{date} · </span>}
        {article.axis}
      </div>
      <div className="ttl">{article.headline}</div>
      {article.summary && <p className="peek">{article.summary}</p>}
    </label>
  );
}

export function ArticleDetail({
  article,
  date,
}: {
  article: Article;
  date?: string;
}) {
  return (
    <article>
      <p className="kicker">
        {date ? `${date} · ` : ''}
        {article.axis}
      </p>
      <h2>{article.headline}</h2>
      {article.summary ? (
        <div className="field">
          <b>요약</b>
          <p>{article.summary}</p>
        </div>
      ) : null}
      {article.analysis ? (
        <div className="field">
          <b>분석</b>
          <p>{article.analysis}</p>
        </div>
      ) : null}
      {article.sources.length > 0 && (
        <div className="field">
          <b>출처</b>
          <div className="refs">
            {article.sources.map((s) =>
              s.url ? (
                <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.label}
                </a>
              ) : (
                <span key={s.label}>{s.label}</span>
              ),
            )}
          </div>
        </div>
      )}
      {!article.summary && !article.analysis && article.sources.length === 0 && (
        <p className="placeholder">이 기사는 제목만 있고 본문이 아직 없습니다.</p>
      )}
    </article>
  );
}
