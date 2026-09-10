import { query } from '@anthropic-ai/claude-agent-sdk';
import type { DailyReport, DailyTrendReport } from './types';
import { dailyReportToMarkdown, dailyTrendingPrompt } from './daily-trend-prompt';
import { formatKstHuman, kstStamp } from './kst';
import { parseDailyTrendMarkdown } from './parse-daily-trend';

function hasLlmAuth(): boolean {
  return !!(process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY);
}

async function runAgent(prompt: string): Promise<string> {
  const model = process.env.CLAUDE_MODEL ?? 'claude-fable-5';
  const maxTurns = Number(process.env.MAX_TURNS ?? 30);
  let result = '';

  for await (const message of query({
    prompt,
    options: {
      model,
      maxTurns,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      allowedTools: ['WebSearch'],
      tools: ['WebSearch'],
      settingSources: [],
      systemPrompt:
        'You are a financial research analyst. Follow instructions exactly. Output only the requested markdown.',
    },
  })) {
    if (message.type === 'result') {
      if (message.subtype === 'success') result = message.result;
      else throw new Error(`Agent failed: ${message.subtype}`);
    }
  }

  const text = result.trim();
  if (!text) throw new Error('Empty LLM response');
  return text;
}

/** 오늘 수집본 → 웹 검색 파급 분석 (대시보드 전용, 수집 파이프라인과 분리) */
export async function analyzeDailyTrend(daily: DailyReport): Promise<DailyTrendReport | null> {
  if (!hasLlmAuth()) {
    console.warn('데일리 급등 LLM — CLAUDE_CODE_OAUTH_TOKEN / ANTHROPIC_API_KEY 없음, 건너뜀');
    return null;
  }

  const markdown = dailyReportToMarkdown(daily);
  if (!markdown) return null;

  const stamp = kstStamp();
  const human = formatKstHuman(daily.date);
  const prompt = dailyTrendingPrompt(stamp, daily.date, human, markdown);

  console.log(`🔥 데일리 급등 LLM — ${daily.date} (${daily.articleCount}편)`);
  const raw = await runAgent(prompt);
  const parsed = parseDailyTrendMarkdown(raw);
  if (!parsed) return null;

  return {
    ...parsed,
    targetDate: parsed.targetDate || daily.date,
    updatedAt: parsed.updatedAt || stamp,
  };
}
