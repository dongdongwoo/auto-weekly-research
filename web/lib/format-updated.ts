function extractUpdatedTime(raw: string | undefined | null): string | null {
  if (!raw?.trim()) return null;
  const time = raw
    .trim()
    .replace(/^업데이트\s*·\s*/i, '')
    .replace(/\s*·?\s*일일\s*\d+\s*일\s*반영\s*$/i, '')
    .replace(/\s*·\s*검증\s*완료.*$/i, '')
    .split('·')[0]
    ?.trim();
  return time || null;
}

/** 주간 브리프 **업데이트** 필드 → UI용 "마지막 갱신" 라벨 */
export function formatLastUpdated(raw: string | undefined | null): string | null {
  const time = extractUpdatedTime(raw);
  return time ? `마지막 갱신 · ${time}` : null;
}

/** 타임스탬프만 (사이드바 등 짧은 표시) */
export function updatedTimeOnly(raw: string | undefined | null): string | null {
  return extractUpdatedTime(raw);
}

/** 트렌드 LLM 업데이트 시각 */
export function formatTrendUpdated(raw: string | undefined | null): string | null {
  const time = extractUpdatedTime(raw);
  return time ? `업데이트 · ${time}` : null;
}
