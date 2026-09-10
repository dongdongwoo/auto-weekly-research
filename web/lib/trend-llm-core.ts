import { query } from '@anthropic-ai/claude-agent-sdk';

export function hasLlmAuth(): boolean {
  return !!(process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY);
}

export async function runTrendAgent(prompt: string): Promise<string> {
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
