/** 보도·언급 수치 → 종합 점수 (정렬용) */
export const COVERAGE_WEIGHT = 0.55;
export const MENTION_WEIGHT = 0.45;

export function parseCount(raw: string): number {
  const t = raw.trim();
  const unit = t.match(/(\d+)\s*(?:편|건|매체|회|번|posts?|mentions?)/i);
  if (unit) return Number.parseInt(unit[1], 10);
  const plain = t.match(/^(\d+)/);
  if (plain) return Number.parseInt(plain[1], 10);
  return 0;
}

/** @deprecated LLM 구 응답(% ) 호환 */
export function parsePct(raw: string): number {
  const m = raw.match(/(\d{1,3})\s*%/);
  if (m) return Math.min(100, Math.max(0, Number.parseInt(m[1], 10)));
  return 0;
}

export function compositeScore(coverageCount: number, mentionCount: number, rising = false): number {
  let score = Math.round(coverageCount * 10 * COVERAGE_WEIGHT + mentionCount * MENTION_WEIGHT);
  if (rising) score += 5;
  return score;
}
