import type { DailyReport, WeeklyReport, WeeklyTrendReport } from '@/lib/types';
import type { OverviewStats } from '@/lib/insights';
import { DAILY_LLM_HINT, weeklyTrendHint } from '@/lib/trend-hints';
import { formatLastUpdated, updatedTimeOnly } from '@/lib/format-updated';
import { splitWeeklyBrief } from '@/lib/weekly-brief';
import {
  ArticleTimeline,
  AxisDonut,
  AxisHeatmap,
  KpiGrid,
  MomentumBars,
  DailyTrendList,
  TrendRankList,
} from './OverviewCharts';
import { TrendModals } from './TrendModals';

export function OverviewPanel({
  weekly,
  stats,
  weeklyTrend,
  dailies,
}: {
  weekly: WeeklyReport | null;
  stats: OverviewStats;
  weeklyTrend: WeeklyTrendReport | null;
  dailies: DailyReport[];
}) {
  const windowStart = dailies
    .map((d) => d.date)
    .sort()
    .slice(-stats.windowDays)[0];
  const weeklyDailies = windowStart
    ? dailies.filter((d) => d.date >= windowStart)
    : dailies;
  const dailyTarget = stats.dailyTrend?.targetDate;
  const dailyDailies = dailyTarget
    ? dailies.filter((d) => d.date === dailyTarget)
    : dailies.slice(0, 1);
  const weeklyBrief = splitWeeklyBrief(weekly);
  const weeklyUpdated = formatLastUpdated(weekly?.updatedAt);
  const weeklyTrendTime = updatedTimeOnly(weeklyTrend?.updatedAt);
  const dailyTrendTime = updatedTimeOnly(stats.dailyTrend?.updatedAt);
  return (
    <div className="overview">
      <header className="overview-hero">
        <p className="overview-kicker">{weekly?.weekId ?? '—'} · 이번 주 브리프</p>
        <h2 className="overview-headline">
          {weeklyBrief.title || '주간 브리프가 생성되면 여기에 표시됩니다'}
        </h2>
        {weeklyBrief.body ? (
          <>
            <input type="checkbox" id="brief-expand" className="sr" />
            <p className="overview-brief-body">{weeklyBrief.body}</p>
            <label htmlFor="brief-expand" className="overview-brief-toggle">
              더 보기
            </label>
          </>
        ) : null}
        <div className="overview-hero-links">
          {weeklyUpdated ? <span className="overview-stamp">{weeklyUpdated}</span> : null}
          <label className="overview-link go-weekly-latest" htmlFor="view-weekly">
            주간 상세 →
          </label>
        </div>
      </header>

      <KpiGrid
        totalRecent={stats.totalRecent}
        pctChange={stats.pctChange}
        prevTotal={stats.prevTotal}
        windowDays={stats.windowDays}
        activeDays={stats.activeDays}
        topAxis={stats.topAxis}
      />

      <div className="chart-row trending-duo">
        <section className="chart-card">
          <div className="chart-head">
            <h3 className="chart-title">주간 상위 언급 이슈</h3>
            <span className="chart-sub">
              최근 {stats.windowDays}일
              {weeklyTrendTime ? ` · ${weeklyTrendTime}` : ''}
            </span>
          </div>
          {weeklyTrend && weeklyTrend.items.length > 0 ? (
            <TrendRankList
              items={weeklyTrend.items}
              updatedAt={weeklyTrend.updatedAt}
              hint={weeklyTrendHint(stats.windowDays)}
              coverageOnly
            />
          ) : (
            <p className="pulse-empty">분석 중 · 1일마다 갱신</p>
          )}
        </section>

        <section className="chart-card">
          <div className="chart-head">
            <h3 className="chart-title">데일리 급등 이슈</h3>
            <span className="chart-sub">
              오늘 {stats.dailyArticleCount}편
              {dailyTrendTime ? ` · ${dailyTrendTime}` : ''}
            </span>
          </div>
          {stats.dailyArticleCount === 0 ? (
            <p className="pulse-empty">오늘 수집된 기사가 없습니다</p>
          ) : stats.dailyTrend && stats.dailyTrend.items.length > 0 ? (
            <DailyTrendList
              items={stats.dailyTrend.items}
              updatedAt={stats.dailyTrend.updatedAt}
              hint={DAILY_LLM_HINT}
            />
          ) : (
            <p className="pulse-empty">분석 중 · 캐시 갱신(30분) 후 표시</p>
          )}
        </section>
      </div>

      <div className="chart-row">
        <section className="chart-card">
          <div className="chart-head">
            <h3 className="chart-title">축별 구성</h3>
            <span className="chart-sub">최근 {stats.windowDays}일</span>
          </div>
          {stats.axisMix.length === 0 ? (
            <p className="pulse-empty">수집 데이터 없음</p>
          ) : (
            <AxisDonut slices={stats.axisMix} />
          )}
        </section>

        <section className="chart-card">
          <div className="chart-head">
            <h3 className="chart-title">축별 모멘텀</h3>
            <span className="chart-sub">전주 vs 이번 주</span>
          </div>
          {stats.axisMomentum.length === 0 ? (
            <p className="pulse-empty">비교 데이터 없음</p>
          ) : (
            <MomentumBars items={stats.axisMomentum} />
          )}
        </section>
      </div>

      <section className="chart-card chart-wide">
        <div className="chart-head">
          <h3 className="chart-title">축 × 날짜</h3>
          <span className="chart-sub">진할수록 기사 많음 · 축마다 고유 색</span>
        </div>
        {stats.heatmap.rows.length === 0 ? (
          <p className="pulse-empty">히트맵 데이터 없음</p>
        ) : (
          <AxisHeatmap data={stats.heatmap} />
        )}
      </section>

      <section className="chart-card chart-wide">
        <div className="chart-head">
          <h3 className="chart-title">최근 타임라인</h3>
          <span className="chart-sub">축 색 = 분류</span>
        </div>
        <ArticleTimeline items={stats.timeline} />
        <label className="overview-link timeline-more" htmlFor="view-daily">
          데일리에서 전체 보기 →
        </label>
      </section>

      <nav className="overview-nav">
        <label className="overview-nav-btn" htmlFor="view-daily">
          데일리 리포트
        </label>
        <label className="overview-nav-btn primary go-weekly-latest" htmlFor="view-weekly">
          주간 인사이트
        </label>
      </nav>

      <TrendModals
        weekly={weeklyTrend?.items ?? []}
        daily={stats.dailyTrend?.items ?? []}
        weeklyDailies={weeklyDailies}
        dailyDailies={dailyDailies}
      />
    </div>
  );
}
