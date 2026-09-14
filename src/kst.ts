/** KST(UTC+9) 기준 날짜 유틸 */

export function kstNow(): Date {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

export function formatKstDate(d: Date): { iso: string; human: string } {
  const iso = d.toISOString().slice(0, 10);
  const human = `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
  return { iso, human };
}

export function kstToday(): { iso: string; human: string } {
  return formatKstDate(kstNow());
}

/** KST 기준 어제 */
export function kstYesterday(): { iso: string; human: string } {
  const d = kstNow();
  d.setUTCDate(d.getUTCDate() - 1);
  return formatKstDate(d);
}

/** kstNow()는 UTC 인스턴스에 +9h를 더한 값 → getUTCHours()가 KST 시 */
export function kstHour(): number {
  return kstNow().getUTCHours();
}

/** 예: 2026-09-10 15:04 KST */
export function kstStamp(): string {
  const d = kstNow();
  const { iso } = formatKstDate(d);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${iso} ${hh}:${mm} KST`;
}

export function addIsoDays(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isMondayKst(): boolean {
  return kstNow().getUTCDay() === 1;
}

/** YYYY-MM-DD → ISO 주차 ID (예: 2026-W34) */
export function isoWeekId(isoDate: string): string {
  const d = parseIsoDate(isoDate);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** 이번 주 월~일(7일) 뉴스 날짜 목록 */
/** 지난주 월요일 (KST) ISO 날짜 */
export function lastWeekMondayIso(): string {
  const d = kstNow();
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (day - 1) - 7);
  return formatKstDate(d).iso;
}

export function weekNewsDates(isoDate: string): string[] {
  const d = parseIsoDate(isoDate);
  const day = d.getUTCDay() || 7;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - (day - 1));

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(monday);
    cur.setUTCDate(monday.getUTCDate() + i);
    dates.push(cur.toISOString().slice(0, 10));
  }
  return dates;
}

function parseIsoDate(iso: string): Date {
  const [y, m, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}
