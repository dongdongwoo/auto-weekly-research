import type {
  AxisHeatmapData,
  AxisMomentum,
  AxisSlice,
  TimelineItem,
  TrendingStory,
} from '@/lib/insights';
import { formatTrendUpdated } from '@/lib/format-updated';
import type { DailyTrendItem } from '@/lib/types';

function withAlpha(hex: string, alpha: number) {
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

export function KpiGrid({
  totalRecent,
  pctChange,
  prevTotal,
  windowDays,
  activeDays,
  topAxis,
}: {
  totalRecent: number;
  pctChange: number;
  prevTotal: number;
  windowDays: number;
  activeDays: number;
  topAxis: AxisSlice | null;
}) {
  const deltaLabel =
    pctChange === 0
      ? '직전과 동일'
      : pctChange > 0
        ? `+${pctChange}%`
        : `${pctChange}%`;

  return (
    <div className="kpi-grid">
      <div className="kpi">
        <span className="kpi-n">{totalRecent}</span>
        <span className="kpi-l">최근 {windowDays}일 기사</span>
      </div>
      <div className="kpi">
        <span className={`kpi-n${pctChange > 0 ? ' up' : pctChange < 0 ? ' down' : ''}`}>{deltaLabel}</span>
        <span className="kpi-l">직전 {windowDays}일 ({prevTotal}편) 대비</span>
      </div>
      <div className="kpi">
        <span className="kpi-n">{activeDays}</span>
        <span className="kpi-l">수집 활성일 / {windowDays}일</span>
      </div>
      <div className="kpi">
        <span className="kpi-n kpi-axis" style={topAxis ? { color: topAxis.color } : undefined}>
          {topAxis?.label ?? '—'}
        </span>
        <span className="kpi-l">최다 축 {topAxis ? `${topAxis.pct}%` : ''}</span>
      </div>
    </div>
  );
}

export function TrendRankList({
  items,
  updatedAt,
  hint,
  showUp = false,
  coverageOnly = false,
}: {
  items: DailyTrendItem[];
  updatedAt?: string;
  hint?: string;
  showUp?: boolean;
  coverageOnly?: boolean;
}) {
  if (items.length === 0) return null;
  const trendUpdated = formatTrendUpdated(updatedAt);

  return (
    <div className="trending">
      {trendUpdated ? <p className="trend-updated">{trendUpdated}</p> : null}
      {items.map((item, rank) => (
        <div
          key={item.id}
          className="trend-card viral trend-card-click"
          data-trend-id={item.id}
          role="button"
          tabIndex={0}
        >
          <div className="trend-rank">{rank + 1}</div>
          <div className="trend-body">
            <p className="trend-meta">
              <span className="trend-stats">
                {coverageOnly
                  ? `보도 ${item.coverageCount}편`
                  : `보도 ${item.coverageCount}편 · SNS ${item.mentionCount}회`}
              </span>
              {showUp && item.rising ? <span className="trend-badge up">UP</span> : null}
            </p>
            <p className="trend-title">{item.headline}</p>
          </div>
        </div>
      ))}
      {hint ? <p className="chart-legend-hint trend-calc">{hint}</p> : null}
    </div>
  );
}

export function DailyTrendList(props: {
  items: DailyTrendItem[];
  updatedAt?: string;
  hint?: string;
}) {
  return <TrendRankList {...props} showUp />;
}

export function TrendingStories({
  items,
  hint,
  upBadge = false,
}: {
  items: TrendingStory[];
  hint?: string;
  /** 데일리 fallback — UP 뱃지만 (주간은 false) */
  upBadge?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <div className="trending">
      {items.map((item, rank) => (
        <div
          key={item.id}
          className="trend-card trend-card-click"
          data-trend-id={item.id}
          role="button"
          tabIndex={0}
        >
          <div className="trend-rank">{rank + 1}</div>
          <div className="trend-body">
            <p className="trend-meta">
              <span className="trend-axis" style={{ color: item.color }}>
                {item.axisLabel}
              </span>
              <span className="trend-stats">
                {item.articleCount}편 · {item.sourceCount}매체
                {item.daySpan > 1 ? ` · ${item.daySpan}일` : ''}
              </span>
              {upBadge && item.rising ? <span className="trend-badge up">UP</span> : null}
            </p>
            <p className="trend-title">{item.headline}</p>
          </div>
          <div className="trend-bar-wrap" title={`관심도 ${item.score}`}>
            <span className="trend-bar" style={{ width: `${Math.min(100, item.score * 8)}%`, background: item.color }} />
          </div>
        </div>
      ))}
      {hint ? <p className="chart-legend-hint trend-calc">{hint}</p> : null}
    </div>
  );
}

export function AxisHeatmap({ data }: { data: AxisHeatmapData }) {
  const { dates, rows, maxCell } = data;
  if (rows.length === 0) return null;

  const cols = `76px repeat(${dates.length}, minmax(36px, 1fr)) 36px`;

  return (
    <div className="hm-v2">
      <div className="hm-v2-head" style={{ gridTemplateColumns: cols }}>
        <span />
        {dates.map((d) => (
          <span key={d.date} className="hm-v2-date">
            {d.label}
          </span>
        ))}
        <span className="hm-v2-sum">합</span>
      </div>
      {rows.map((row) => (
        <div key={row.key} className="hm-v2-row" style={{ gridTemplateColumns: cols }}>
          <span className="hm-v2-axis">
            <span className="hm-v2-dot" style={{ background: row.color }} />
            {row.label}
          </span>
          {row.cells.map((cell) => {
            const ratio = cell.count / maxCell;
            const intensity = cell.count ? 0.38 + ratio * 0.62 : 0;
            const bg = cell.count ? withAlpha(row.color, intensity) : '#f5f5f4';
            const lightText = !cell.count || ratio < 0.55;
            return (
              <span
                key={cell.date}
                className={`hm-v2-cell${cell.count ? ' on' : ''}`}
                style={{ background: bg, color: lightText ? '#44403c' : '#fff' }}
                title={`${row.label} · ${cell.label} · ${cell.count}편`}
              >
                {cell.count > 0 ? cell.count : ''}
              </span>
            );
          })}
          <span className="hm-v2-total">{row.total}</span>
        </div>
      ))}
    </div>
  );
}

export function AxisDonut({ slices }: { slices: AxisSlice[] }) {
  const total = slices.reduce((s, x) => s + x.count, 0) || 1;
  const r = 42;
  const cx = 50;
  const cy = 50;
  let angle = -90;

  const arcs = slices.map((s) => {
    const sweep = (s.count / total) * 360;
    const start = angle;
    angle += sweep;
    const end = angle;
    const large = sweep > 180 ? 1 : 0;
    const rad = (deg: number) => (deg * Math.PI) / 180;
    const x1 = cx + r * Math.cos(rad(start));
    const y1 = cy + r * Math.sin(rad(start));
    const x2 = cx + r * Math.cos(rad(end));
    const y2 = cy + r * Math.sin(rad(end));
    if (sweep >= 359.9) {
      return { ...s, d: `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy}` };
    }
    return {
      ...s,
      d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`,
    };
  });

  return (
    <div className="donut-wrap">
      <svg className="chart-donut" viewBox="0 0 100 100" aria-hidden>
        {arcs.map((a) => (
          <path key={a.key} d={a.d} fill={a.color}>
            <title>{`${a.label} ${a.count} (${a.pct}%)`}</title>
          </path>
        ))}
        <circle cx={cx} cy={cy} r={24} fill="var(--card)" />
        <text x={cx} y={cy - 2} textAnchor="middle" className="donut-center-n">
          {total}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" className="donut-center-l">
          편
        </text>
      </svg>
      <ul className="donut-legend">
        {slices.map((s) => (
          <li key={s.key}>
            <span className="dot" style={{ background: s.color }} />
            {s.label}
            <b>{s.count}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MomentumBars({ items }: { items: AxisMomentum[] }) {
  const max = Math.max(1, ...items.map((i) => Math.max(i.recent, i.prev)));

  return (
    <div className="momentum">
      {items.slice(0, 7).map((item) => (
        <div key={item.key} className="momentum-row">
          <span className="momentum-label" style={{ color: item.color }}>
            {item.label}
          </span>
          <div className="momentum-tracks">
            <span
              className="momentum-bar prev"
              style={{ width: `${(item.prev / max) * 100}%`, background: item.color }}
              title={`직전 ${item.prev}`}
            />
            <span
              className="momentum-bar recent"
              style={{ width: `${(item.recent / max) * 100}%`, background: item.color }}
              title={`최근 ${item.recent}`}
            />
          </div>
          <span className={`momentum-delta${item.delta > 0 ? ' up' : item.delta < 0 ? ' down' : ''}`}>
            {item.delta > 0 ? `+${item.delta}` : item.delta}
          </span>
        </div>
      ))}
      <p className="chart-legend-hint">위 · 직전 7일 / 아래 · 최근 7일</p>
    </div>
  );
}

export function ArticleTimeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="timeline">
      {items.map((item, i) => (
        <div key={item.id} className="timeline-item">
          <div className="timeline-rail">
            <span className="timeline-dot" style={{ background: item.color }} />
            {i < items.length - 1 ? <span className="timeline-line" /> : null}
          </div>
          <div className="timeline-body">
            <p className="timeline-meta">
              <span style={{ color: item.color }}>{item.axisLabel}</span>
              <span>{item.dayLabel}</span>
            </p>
            <p className="timeline-title">{item.headline}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
