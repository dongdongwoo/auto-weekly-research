import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(
      `❌ 환경변수 ${name} 이(가) 없습니다. .env 파일을 확인하세요 (.env.example 참조)`,
    );
    process.exit(1);
  }
  return v;
}

function hasAuth(): boolean {
  return !!(process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY);
}

/** OAuth(구독) 또는 API 키 중 하나는 있어야 함. 로컬 로그인만 쓸 경우 OAuth/API 모두 없어도 CLI keychain 사용 가능 */
export function ensureAuth(): void {
  if (hasAuth()) return;
  console.log(
    'ℹ️  CLAUDE_CODE_OAUTH_TOKEN / ANTHROPIC_API_KEY 없음 — 로컬 Claude Code 로그인 세션 사용',
  );
}

/** API 키가 OAuth보다 우선 → 구독 사용 시 경고 */
export function warnIfAuthConflict(): void {
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN && process.env.ANTHROPIC_API_KEY) {
    console.warn(
      '⚠️  ANTHROPIC_API_KEY와 CLAUDE_CODE_OAUTH_TOKEN이 동시에 설정됨 — API 키가 우선되어 API 과금됩니다.\n' +
        '    구독 쿼터를 쓰려면 ANTHROPIC_API_KEY를 .env에서 제거하세요.',
    );
  }
}

export const config = {
  notionApiKey: required('NOTION_API_KEY'),
  notionPageId: required('NOTION_PAGE_ID'),
  model: process.env.CLAUDE_MODEL ?? 'claude-fable-5',
  maxTurns: Number(process.env.MAX_TURNS ?? 30),
  /** 중복 체크: 최근 1달(30일) */
  dedupLookbackDays: 30,
};
