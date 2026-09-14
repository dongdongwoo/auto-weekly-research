import { query } from '@anthropic-ai/claude-agent-sdk';
import { config, warnIfAuthConflict } from './config.js';

type AgentRunOptions = {
  webSearch: boolean;
  systemRules?: string;
  maxTurns?: number;
};

async function runAgent(prompt: string, opts: AgentRunOptions): Promise<string> {
  const fullPrompt = opts.systemRules ? `${opts.systemRules}\n\n---\n\n${prompt}` : prompt;
  const maxTurns = opts.maxTurns ?? (opts.webSearch ? config.maxTurnsSearch : config.maxTurns);

  let result = '';

  for await (const message of query({
    prompt: fullPrompt,
    options: {
      model: config.model,
      maxTurns,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      allowedTools: opts.webSearch ? ['WebSearch'] : [],
      tools: opts.webSearch ? ['WebSearch'] : [],
      settingSources: [],
      systemPrompt:
        'You are a financial research analyst. Follow the user instructions exactly. Output only the requested markdown with no preamble or closing remarks.',
    },
  })) {
    if (message.type === 'result') {
      if (message.subtype === 'success') {
        result = message.result;
      } else if (message.subtype === 'error_max_turns') {
        throw new Error(
          `Agent 실행 실패: error_max_turns (한도 ${maxTurns}턴). ` +
            'MAX_TURNS_SEARCH를 70~80으로 올리거나 npm run collect로 축소 수집 후 재시도하세요.',
        );
      } else {
        throw new Error(`Agent 실행 실패: ${message.subtype}`);
      }
    }
  }

  const text = result.trim();
  if (!text) {
    throw new Error('Agent 응답이 비어 있습니다.');
  }
  return text;
}

/** 웹 검색 활성 — 일일 수집·월간 딥다이브 */
export async function generateWithSearch(prompt: string): Promise<string> {
  warnIfAuthConflict();
  console.log(`🤖 모델: ${config.model}`);
  console.log(`🔎 Agent SDK — 웹 검색으로 수집 중... (최대 ${config.maxTurnsSearch}턴, 5~15분)`);

  const text = await runAgent(prompt, { webSearch: true, maxTurns: config.maxTurnsSearch });
  console.log(`✅ 수집 완료 (${text.length}자)`);
  return text;
}

/** 웹 검색 없음 — 일일 원문만 근거로 주간 초안 */
export async function generateFromContext(
  systemRules: string,
  userContent: string,
): Promise<string> {
  warnIfAuthConflict();
  console.log(`🤖 모델: ${config.model}`);
  console.log('📝 Agent SDK — 일일 수집본 기반 작성 중...');

  const text = await runAgent(userContent, { webSearch: false, systemRules });
  console.log(`✅ 초안 완료 (${text.length}자, 웹 검색 없음)`);
  return text;
}

/** 웹 검색으로 초안 사실·수치 검증 후 최종본 */
export async function generateVerified(
  systemRules: string,
  userContent: string,
): Promise<string> {
  warnIfAuthConflict();
  console.log(`🤖 모델: ${config.model}`);
  console.log(`🔎 Agent SDK — 주간 인사이트 교차검증 중... (최대 ${config.maxTurnsSearch}턴)`);

  const text = await runAgent(userContent, {
    webSearch: true,
    systemRules,
    maxTurns: config.maxTurnsSearch,
  });
  console.log(`✅ 검증 완료 (${text.length}자)`);
  return text;
}
