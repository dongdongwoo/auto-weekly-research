export type SourceLink = { label: string; url: string };

export type Article = {
  id: string;
  headline: string;
  summary: string;
  analysis: string;
  sources: SourceLink[];
  axis: string;
  /** Notion 블록 생성 시각 — 시간별 증분 수집 시각 추정 */
  collectedAt?: string;
};

export type DailyReport = {
  date: string;
  weekId: string;
  weekTitle: string;
  axes: { name: string; articles: Article[] }[];
  articleCount: number;
  searchText: string;
};

export type WeeklySignal = {
  id: string;
  title: string;
  body: string;
  sources: SourceLink[];
};

export type WeeklyIssue = {
  id: string;
  title: string;
  fact: string;
  crossCheck: string;
  analysis: string;
  why: string;
  confidence: string;
  sources: SourceLink[];
};

export type WeeklyTheme = {
  id: string;
  title: string;
  interpretation: string;
  sources: SourceLink[];
};

export type WeeklyOutlook = {
  id: string;
  title: string;
  base: string;
  upside: string;
  downside: string;
  watch: string;
  sources: SourceLink[];
};

export type ProductInsight = {
  name: string;
  tech?: string;
  regulation?: string;
  business?: string;
  opportunity?: string;
  risk?: string;
  action?: string;
  sources: SourceLink[];
};

export type WeeklyCaveat = {
  id: string;
  title: string;
  body: string;
  sources: SourceLink[];
};

export type WeeklyReport = {
  weekId: string;
  weekTitle: string;
  /** 이번 주 브리프 한 줄 제목 */
  briefTitle: string;
  /** 이번 주 브리프 본문 */
  headlineSummary: string;
  updatedAt: string;
  confidenceOverview: string;
  signals: WeeklySignal[];
  issues: WeeklyIssue[];
  themes: WeeklyTheme[];
  outlook: WeeklyOutlook[];
  products: ProductInsight[];
  caveats: WeeklyCaveat[];
  searchText: string;
};

export type WeekPage = {
  id: string;
  title: string;
  weekId: string;
};

export type DailyTrendItem = {
  id: string;
  headline: string;
  score: number;
  coverageCount: number;
  mentionCount: number;
  rising: boolean;
  summary: string;
  sources: SourceLink[];
};

export type DailyTrendReport = {
  targetDate: string;
  updatedAt: string;
  items: DailyTrendItem[];
};

export type WeeklyTrendReport = DailyTrendReport;

export type DashboardData = {
  hubTitle: string;
  generatedAt: string;
  weeks: WeekPage[];
  dailies: DailyReport[];
  weeklies: WeeklyReport[];
  dailyTrend: DailyTrendReport | null;
  weeklyTrend: WeeklyTrendReport | null;
  stats: {
    totalArticles: number;
    totalDailies: number;
    totalWeeklies: number;
    latestDaily: string | null;
    latestWeekly: string | null;
  };
};
