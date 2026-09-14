export function weeklyTrendHint(windowDays: number): string {
  return [
    `계산방식) 1일마다 LLM 웹검색 ${windowDays}일 보도 추정 (정확 집계 아님)`,
    '· 보도 N편 — 기간 내 관련 기사 건수 추정 (SNS·API 집계 아님)',
  ].join('\n');
}

export const DAILY_LLM_HINT = [
  '계산방식) 30분마다 LLM 웹검색 추정 (정확 집계·API 카운트 아님)',
  '· 보도 N편 — 오늘 웹상 관련 기사 건수',
  '· SNS N회 — X·Reddit·링크드인 등 커뮤니티 언급 횟수',
].join('\n');
