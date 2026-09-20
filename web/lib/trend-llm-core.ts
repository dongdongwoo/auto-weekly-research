import { query } from '@anthropic-ai/claude-agent-sdk';

const SYSTEM =
  'You are a financial research analyst. Follow instructions exactly. Output only the requested markdown.';

const SERVERLESS_APPEND = `

## Vercel 제약 (웹 검색 불가)
- 입력 수집본·출처 URL만 근거로 사용
- **보도** · N편 — 입력에서 해당 이슈와 직접 관련된 기사 수
- **언급** · N회 — 보도 건수 기반 보수적 추정 (입력에 없는 새 URL 금지)
`;

function isServerless(): boolean {
  return !!process.env.VERCEL || process.env.TREND_LLM_MODE === 'serverless';
}

export function hasLlmAuth(): boolean {
  return !!process.env.CLAUDE_CODE_OAUTH_TOKEN;
}

export async function runTrendAgent(prompt: string): Promise<string> {
  const webSearch = !isServerless();
  const fullPrompt = webSearch ? prompt : prompt + SERVERLESS_APPEND;
  const model = process.env.CLAUDE_MODEL ?? 'claude-opus-4-6';
  const maxTurns = Number(
    process.env.MAX_TURNS ?? (webSearch ? 30 : 8),
  );

  if (isServerless()) {
    console.log('🔥 트렌드 LLM — Agent SDK (Vercel, 수집본만)');
  }

  let result = '';

  for await (const message of query({
    prompt: fullPrompt,
    options: {
      model,
      maxTurns,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      allowedTools: webSearch ? ['WebSearch'] : [],
      tools: webSearch ? ['WebSearch'] : [],
      settingSources: [],
      systemPrompt: SYSTEM,
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
