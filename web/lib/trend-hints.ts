export function weeklyTrendHint(windowDays: number): string {
  return `계산방식) 1일마다 LLM이 ${windowDays}일 보도 편수 추정`;
}

export const DAILY_LLM_HINT =
  '계산방식) 30분마다 LLM이 보도 편수·SNS 언급 회수 추정, UP는 가속';
