/** KST(UTC+9) — 대시보드 LLM 스탬프용 */

function kstNow() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

export function kstStamp(): string {
  const d = kstNow();
  const iso = d.toISOString().slice(0, 10);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${iso} ${hh}:${mm} KST`;
}

export function formatKstHuman(iso: string): string {
  const [y, m, day] = iso.split('-').map(Number);
  return `${y}년 ${m}월 ${day}일`;
}
