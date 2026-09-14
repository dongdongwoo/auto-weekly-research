import type { ReactNode } from 'react';
import type { DashboardData, WeeklyReport, WeeklySignal } from '@/lib/types';
import { buildOverviewStats } from '@/lib/insights';
import { splitWeeklyBrief } from '@/lib/weekly-brief';
import { ArticleDetail, ArticleRow } from './ArticleCard';
import { OverviewPanel } from './OverviewPanel';
import { SourceLinks } from './SourceLinks';

const AXES = [
  { key: 'rwa', label: 'RWA 토큰화' },
  { key: 'stock', label: '상장주식' },
  { key: 'tradfi', label: 'TradFi' },
  { key: 'krreg', label: '국내 규제' },
  { key: 'globalreg', label: '해외 규제' },
  { key: 'krsec', label: '국내 증권' },
  { key: 'partner', label: '파트너십' },
  { key: 'ai', label: 'AI × 금융' },
  { key: 'crypto', label: '크립토 구조' },
] as const;

type FlatArticle = {
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

function formatDate(iso: string) {
  const [, m, d] = iso.split('-');
  return `${Number(m)}.${Number(d)}`;
}

function sid(raw: string) {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '-');
}

function axisKey(axis: string) {
  return AXES.find((a) => axis.includes(a.label))?.key ?? 'other';
}

function flattenArticles(dailies: DashboardData['dailies']): FlatArticle[] {
  return dailies.flatMap((d) =>
    d.axes.flatMap((a) => a.articles.map((art) => ({ ...art, date: d.date, weekId: d.weekId }))),
  );
}

function articleHaystack(a: FlatArticle) {
  return [a.headline, a.summary, a.analysis, a.axis, a.date, a.weekId, ...a.sources.map((s) => s.label)]
    .filter(Boolean)
    .join(' ');
}

function confidenceClass(raw: string) {
  if (raw.startsWith('높음')) return 'high';
  if (raw.startsWith('낮음')) return 'low';
  if (raw.startsWith('중간')) return 'mid';
  return 'mid';
}

export function Dashboard({
  data,
  initialQuery = '',
}: {
  data: DashboardData;
  initialQuery?: string;
}) {
  const articles = flattenArticles(data.dailies);
  const searching = initialQuery.trim().length > 0;
  const latest = data.weeklies[0] ?? null;
  const overviewStats = buildOverviewStats(articles, data.dailies, 7, data.dailyTrend);

  const css = [
    ...articles.map((a) => {
      const id = sid(a.id);
      return `.workspace:has(#art-${id}:checked) #pane-${id}{display:block}`;
    }),
    ...data.weeklies.map((w) => {
      const id = sid(w.weekId);
      return `.workspace:has(#w-art-${id}:checked) #w-pane-${id}{display:block}`;
    }),
    ...data.dailies.map((d) => {
      const id = sid(d.date);
      return [
        `.shell:has(#view-daily:checked):not(.is-searching):has(#dd-${id}:checked) .panel-articles .row:not([data-date="${id}"]){display:none}`,
        `.shell:has(#view-daily:checked):not(.is-searching):has(#dd-${id}:checked) .panel-articles .pane:not([data-date="${id}"]){display:none}`,
      ].join('');
    }),
  ].join('');

  return (
    <div
      className={`shell${searching ? ' is-searching' : ''}`}
      data-generated-at={data.generatedAt}
      data-refresh-sec={process.env.NOTION_CACHE_SECONDS ?? '1800'}
    >
      <style>{css}</style>
      <input className="sr" type="radio" name="view" id="view-home" defaultChecked />
      <input className="sr" type="radio" name="view" id="view-daily" />
      <input className="sr" type="radio" name="view" id="view-weekly" />
      {data.dailies.map((d, i) => (
        <input
          key={d.date}
          className="sr"
          type="radio"
          name="daily-date"
          id={`dd-${sid(d.date)}`}
          defaultChecked={i === 0}
        />
      ))}

      <header className="bar">
        <label className="logo" htmlFor="view-home">
          주간 인사이트
        </label>
        <nav className="nav">
          <label htmlFor="view-home">대시보드</label>
          <label htmlFor="view-daily">데일리</label>
          <label htmlFor="view-weekly">주간</label>
        </nav>
        {latest?.updatedAt ? <p className="stamp">{latest.updatedAt}</p> : null}
      </header>

      <div className="workspace">
        <div className="tools">
          <input
            className="q"
            type="search"
            data-q=""
            placeholder="제목, 요약, 이슈 검색"
            defaultValue={initialQuery}
          />
          <select className="sort" data-sort="" defaultValue="new">
            <option value="new">최신순</option>
            <option value="old">오래된순</option>
          </select>
        </div>

        <section className="panel panel-home">
          <OverviewPanel
            weekly={latest}
            stats={overviewStats}
            weeklyTrend={data.weeklyTrend}
            dailies={data.dailies}
          />
        </section>

        <section className="panel panel-articles">
          <div className="split">
            <aside className="list">
              <div className="days">
                <input
                  className="day-pick"
                  type="date"
                  data-day=""
                  data-dates={data.dailies.map((d) => d.date).join(',')}
                  min={data.dailies.at(-1)?.date}
                  max={data.dailies[0]?.date}
                  defaultValue={data.dailies[0]?.date}
                />
              </div>
              <div className="filters">
                <label>
                  <input
                    className="sr"
                    type="radio"
                    name="axis"
                    value="all"
                    data-axis-filter=""
                    defaultChecked
                  />
                  전체
                </label>
                {AXES.map((a) => (
                  <label key={a.key}>
                    <input className="sr" type="radio" name="axis" value={a.key} data-axis-filter="" />
                    {a.label}
                  </label>
                ))}
              </div>
              {articles.length === 0 ? (
                <div className="empty">아직 기사가 없습니다.</div>
              ) : (
                <div className="rows" data-sort-list="">
                  {articles.map((a, i) => (
                    <ArticleRow
                      key={a.id}
                      article={a}
                      date={formatDate(a.date)}
                      inputId={`art-${sid(a.id)}`}
                      name="art"
                      defaultChecked={i === 0}
                      haystack={articleHaystack(a)}
                      weekId={a.weekId}
                      axisKey={axisKey(a.axis)}
                      dateKey={sid(a.date)}
                    />
                  ))}
                </div>
              )}
              <p className="empty search-empty">맞는 기사가 없습니다.</p>
            </aside>
            <main className="detail">
              {articles.map((a) => (
                <div
                  key={a.id}
                  className="pane"
                  id={`pane-${sid(a.id)}`}
                  data-date={sid(a.date)}
                  data-week-id={a.weekId}
                  data-ax={axisKey(a.axis)}
                >
                  <ArticleDetail article={a} date={formatDate(a.date)} />
                </div>
              ))}
              {articles.length === 0 && (
                <p className="placeholder">왼쪽에서 기사를 고르면 여기에 본문이 나옵니다.</p>
              )}
            </main>
          </div>
        </section>

        <WeeklyPanel weeklies={data.weeklies} />
      </div>
    </div>
  );
}

function WeeklyPanel({ weeklies }: { weeklies: WeeklyReport[] }) {
  return (
    <section className="panel panel-weekly">
      <div className="split">
        <aside className="list">
          {weeklies.length === 0 ? (
            <div className="empty">주간 인사이트는 기사가 쌓이면 시간마다 올라옵니다.</div>
          ) : (
            <div className="rows" data-sort-list="">
              {weeklies.map((w, i) => {
                const brief = splitWeeklyBrief(w);
                return (
                <label
                  key={w.weekId}
                  className="row"
                  htmlFor={`w-art-${sid(w.weekId)}`}
                  data-s={w.searchText}
                  data-week-id={w.weekId}
                >
                  <input
                    className="sr"
                    type="radio"
                    name="weekly-art"
                    id={`w-art-${sid(w.weekId)}`}
                    defaultChecked={i === 0}
                  />
                  <div className="meta">{w.updatedAt || w.weekId}</div>
                  <div className="ttl">
                    {brief.title || w.issues[0]?.title || '주간 인사이트'}
                  </div>
                  <p className="peek">
                    {brief.body
                      ? brief.body.slice(0, 120)
                      : w.headlineSummary
                        ? w.headlineSummary.slice(0, 120)
                        : `이슈 ${w.issues.length} · 시그널 ${w.signals.length}`}
                  </p>
                </label>
                );
              })}
            </div>
          )}
        </aside>
        <main className="detail">
          {weeklies.map((w) => (
            <div key={w.weekId} className="pane" id={`w-pane-${sid(w.weekId)}`} data-week-id={w.weekId}>
              <WeeklyDetail report={w} />
            </div>
          ))}
          {weeklies.length === 0 && <p className="placeholder">왼쪽에서 주간을 고르세요.</p>}
        </main>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  if (!children) return null;
  const empty = typeof children === 'string' && !children.trim();
  if (empty) return null;
  return (
    <div className="field">
      <b>{label}</b>
      {typeof children === 'string' ? <p>{children}</p> : children}
    </div>
  );
}

function Fold({
  id,
  title,
  kicker,
  badge,
  open,
  children,
}: {
  id?: string;
  title: string;
  kicker?: string;
  badge?: string;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="fold" id={id} open={open}>
      <summary>
        <span className="fold-title">
          {kicker ? <b>{kicker}</b> : null}
          {title}
        </span>
        {badge ? (
          <span className={`badge ${confidenceClass(badge)}`}>{badge.split(/[—–-]/)[0].trim()}</span>
        ) : null}
      </summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}

function WeeklyDetail({ report }: { report: WeeklyReport }) {
  const brief = splitWeeklyBrief(report);
  return (
    <article>
      <p className="kicker">{report.weekId}</p>
      <h2>{brief.title || report.issues[0]?.title || '주간 브리프'}</h2>
      {brief.body ? <p className="weekly-brief-body">{brief.body}</p> : null}
      <div className="meta-row">
        {report.updatedAt ? <span>{report.updatedAt}</span> : null}
        {report.confidenceOverview ? (
          <span className={`badge ${confidenceClass(report.confidenceOverview)}`}>
            {report.confidenceOverview}
          </span>
        ) : null}
      </div>

      {report.signals.length > 0 && (
        <section className="block-sec">
          <h3 className="sec-title">핵심 시그널</h3>
          <div className="signals">
            {report.signals.map((s) => (
              <SignalCard key={s.id} signal={s} />
            ))}
          </div>
        </section>
      )}

      {report.issues.length > 0 && (
        <div className="fold-group">
          <p className="sec-title">이슈 {report.issues.length}</p>
          {report.issues.map((issue, i) => (
            <Fold
              key={issue.id}
              id={sid(issue.id)}
              title={issue.title}
              badge={issue.confidence}
              open={i === 0}
            >
              <Field label="사실">{issue.fact}</Field>
              <Field label="교차검증">{issue.crossCheck}</Field>
              <Field label="분석">{issue.analysis}</Field>
              <Field label="왜 주목">{issue.why}</Field>
              {issue.sources.length > 0 ? (
                <Field label="출처">
                  <SourceLinks sources={issue.sources} />
                </Field>
              ) : null}
            </Fold>
          ))}
        </div>
      )}

      {report.themes.length > 0 && (
        <div className="fold-group">
          <p className="sec-title">이번 주 흐름 {report.themes.length}</p>
          {report.themes.map((t) => (
            <Fold key={t.id} title={t.title}>
              {t.interpretation ? <p>{t.interpretation}</p> : null}
              <SourceLinks sources={t.sources} />
            </Fold>
          ))}
        </div>
      )}

      {report.outlook.length > 0 && (
        <div className="fold-group">
          <p className="sec-title">시나리오 · 주시 {report.outlook.length}</p>
          {report.outlook.map((o) => (
            <Fold key={o.id} title={o.title}>
              <Field label="기본">{o.base}</Field>
              <Field label="상방">{o.upside}</Field>
              <Field label="하방">{o.downside}</Field>
              <Field label="주시">{o.watch}</Field>
              <SourceLinks sources={o.sources} />
            </Fold>
          ))}
        </div>
      )}

      {report.products.length > 0 && (
        <div className="fold-group">
          <p className="sec-title">프로덕트 {report.products.length}</p>
          {report.products.map((p) => (
            <Fold key={p.name} title={p.name}>
              <Field label="기술">{p.tech ?? ''}</Field>
              <Field label="규제">{p.regulation ?? ''}</Field>
              <Field label="비즈니스">{p.business ?? ''}</Field>
              <Field label="기회">{p.opportunity ?? ''}</Field>
              <Field label="리스크">{p.risk ?? ''}</Field>
              <Field label="액션">{p.action ?? ''}</Field>
              <SourceLinks sources={p.sources} />
            </Fold>
          ))}
        </div>
      )}

      {report.caveats.length > 0 && (
        <div className="fold-group">
          <p className="sec-title">미확인 · 주의 {report.caveats.length}</p>
          {report.caveats.map((c) => (
            <Fold key={c.id} title={c.title}>
              {c.body ? <p>{c.body}</p> : null}
              <SourceLinks sources={c.sources} />
            </Fold>
          ))}
        </div>
      )}
    </article>
  );
}

function SignalCard({ signal }: { signal: WeeklySignal }) {
  return (
    <div className="signal">
      <h4>{signal.title}</h4>
      {signal.body ? <p>{signal.body}</p> : null}
      <SourceLinks sources={signal.sources} />
    </div>
  );
}
