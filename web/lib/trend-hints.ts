export function weeklyTrendHint(windowDays: number): string {
  return `계산방식) 최근 ${windowDays}일 수집 기사를 묶어 기사·매체 많은 순`;
}

export const DAILY_LLM_HINT =
  '계산방식) 30분마다 LLM이 보도 편수·SNS 언급 회수 추정, UP는 가속';
