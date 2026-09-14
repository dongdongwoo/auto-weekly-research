import type { DailyReport, DailyTrendReport } from './types';
import { dailyReportToMarkdown, dailyTrendingPrompt } from './daily-trend-prompt';
import { formatKstHuman, kstStamp } from './kst';
import { parseTrendMarkdown } from './parse-daily-trend';
import { hasLlmAuth, runTrendAgent } from './trend-llm-core';

/** 오늘 수집본 → 웹 검색 파급 분석 (대시보드 전용, 수집 파이프라인과 분리) */
export async function analyzeDailyTrend(daily: DailyReport): Promise<DailyTrendReport | null> {
  if (!hasLlmAuth()) {
    console.warn('데일리 급등 LLM — CLAUDE_CODE_OAUTH_TOKEN 없음, 건너뜀');
    return null;
  }

  const markdown = dailyReportToMarkdown(daily);
  if (!markdown) return null;

  const stamp = kstStamp();
  const human = formatKstHuman(daily.date);
  const prompt = dailyTrendingPrompt(stamp, daily.date, human, markdown);

  console.log(`🔥 데일리 급등 LLM — ${daily.date} (${daily.articleCount}편)`);
  const raw = await runTrendAgent(prompt);
  const parsed = parseTrendMarkdown(raw, 'dt');
  if (!parsed) return null;

  return {
    ...parsed,
    targetDate: parsed.targetDate || daily.date,
    updatedAt: parsed.updatedAt || stamp,
  };
}
