import type { DailyReport, WeeklyTrendReport } from './types';
import { kstStamp } from './kst';
import { parseTrendMarkdown } from './parse-daily-trend';
import { hasLlmAuth, runTrendAgent } from './trend-llm-core';
import { dailiesToMarkdown, weeklyTrendingPrompt } from './weekly-trend-prompt';

export async function analyzeWeeklyTrend(
  dailies: DailyReport[],
  windowDays = 7,
): Promise<WeeklyTrendReport | null> {
  if (!hasLlmAuth()) {
    console.warn('주간 상위 LLM — CLAUDE_CODE_OAUTH_TOKEN / ANTHROPIC_API_KEY 없음, 건너뜀');
    return null;
  }

  const slice = dailies.slice(0, windowDays).filter((d) => d.articleCount > 0);
  if (slice.length === 0) return null;

  const markdown = dailiesToMarkdown(slice);
  if (!markdown) return null;

  const dateTo = slice[0].date;
  const dateFrom = slice[slice.length - 1].date;
  const stamp = kstStamp();
  const total = slice.reduce((n, d) => n + d.articleCount, 0);

  console.log(`📊 주간 상위 LLM — ${dateFrom}~${dateTo} (${total}편)`);
  const prompt = weeklyTrendingPrompt(stamp, dateFrom, dateTo, markdown, windowDays);
  const raw = await runTrendAgent(prompt);
  const parsed = parseTrendMarkdown(raw, 'wt');
  if (!parsed) return null;

  const items = parsed.items
    .map((item) => ({ ...item, mentionCount: 0 }))
    .sort((a, b) => b.coverageCount - a.coverageCount || b.score - a.score);

  return {
    ...parsed,
    items,
    targetDate: parsed.targetDate || `${dateFrom}~${dateTo}`,
    updatedAt: parsed.updatedAt || stamp,
  };
}
