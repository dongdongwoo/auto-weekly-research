export function weeklyTrendHint(windowDays: number): string {
  return [
    `계산방식) GHA 매시 웹검색 · 최근 ${windowDays}일 수집본 기준 보도 추정 (정확 집계 아님)`,
    '· Notion 📈 주간 상위 스냅샷 → 대시보드는 읽기 전용 (Vercel LLM 없음)',
    '· 보도 N편 — 기간 내 관련 기사 건수 추정 (SNS·API 집계 아님)',
  ].join('\n');
}

export const DAILY_TREND_HINT = [
  '계산방식) GHA 매시 웹검색 · 오늘 수집본 기준 추정 (정확 집계·API 카운트 아님)',
  '· Notion 📈 데일리 급등 스냅샷 → 대시보드는 읽기 전용 (Vercel LLM 없음)',
  '· 보도 N편 — 오늘 웹상 관련 기사 건수',
  '· SNS N회 — X·Reddit·링크드인 등 커뮤니티 언급 횟수',
].join('\n');
