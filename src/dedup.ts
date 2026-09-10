import { extractLinks } from './links.js';
import { fetchDailyLogsInRange, cutoffIso } from './notionRead.js';
import { splitNewsItems, headlineFromItem, isPlaceholderItem } from './newsItems.js';
import { addIsoDays } from './kst.js';

export type KnownItem = {
  date: string;
  url: string;
  headline: string;
};

export type DedupResult = {
  content: string;
  removedCount: number;
  remainingCount: number;
};

const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'ref',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'si',
  's',
];

/** URL 비교용 정규화 (utm 제거, http→https, trailing slash, 소문자 호스트) */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    if (u.protocol === 'http:') u.protocol = 'https:';
    u.hash = '';
    TRACKING_PARAMS.forEach((k) => u.searchParams.delete(k));
    u.hostname = u.hostname.replace(/^www\./, '').toLowerCase();
    const path = u.pathname.replace(/\/+$/, '') || '/';
    const search = u.searchParams.toString();
    return `${u.protocol}//${u.hostname}${path}${search ? `?${search}` : ''}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

/** 헤드라인 비교용 정규화 */
export function normalizeHeadline(text: string): string {
  return text
    .toLowerCase()
    .replace(/\*\*/g, '')
    .replace(/[^\w\s가-힣]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function headlineFromBlock(block: string): string | null {
  return headlineFromItem(block);
}

/** 헤드라인 유사 중복 (완전 일치 또는 한쪽이 80% 이상 포함) */
export function isSimilarHeadline(a: string, b: string): boolean {
  const na = normalizeHeadline(a);
  const nb = normalizeHeadline(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length > nb.length ? na : nb;
  if (shorter.length < 12) return false;
  return longer.includes(shorter);
}

export function knownFromBlock(date: string, block: string): KnownItem[] {
  if (isPlaceholderItem(block)) return [];
  const headline = headlineFromBlock(block);
  const urls = extractLinks(block)
    .map((l) => normalizeUrl(l.url))
    .filter(Boolean);

  if (urls.length === 0) {
    return headline ? [{ date, url: '', headline }] : [];
  }
  return urls.map((url) => ({
    date,
    url,
    headline: headline ?? url,
  }));
}

function isKnownBlock(block: string, known: KnownItem[]): boolean {
  if (isPlaceholderItem(block)) return false;

  const headline = headlineFromBlock(block);
  const urls = extractLinks(block)
    .map((l) => normalizeUrl(l.url))
    .filter(Boolean);

  for (const k of known) {
    if (k.url && urls.some((u) => u === k.url)) return true;
    if (headline && k.headline && isSimilarHeadline(headline, k.headline)) return true;
  }
  return false;
}

/**
 * Notion에 이미 수집된 URL·헤드라인.
 * includeTargetDate=true 이면 targetIso 당일 분도 포함 (시간별 증분 수집용).
 */
export async function loadKnownItems(
  targetIso: string,
  lookbackDays: number,
  includeTargetDate = false
): Promise<KnownItem[]> {
  const cutoff = cutoffIso(targetIso, lookbackDays);
  const beforeIso = includeTargetDate ? addIsoDays(targetIso, 1) : targetIso;
  const items: KnownItem[] = [];
  const logs = await fetchDailyLogsInRange(cutoff, beforeIso);

  for (const { iso, content } of logs) {
    for (const block of splitNewsItems(content)) {
      items.push(...knownFromBlock(iso, block));
    }
  }

  return items;
}

/** 기사 없는 ## 축 섹션 제거 — 시간별 병합 시 빈 토글이 쌓이지 않게 */
export function stripEmptyAxes(md: string): string {
  const chunks = md.split(/(?=^## )/m);
  const kept = chunks.filter((chunk) => {
    const body = chunk.trim();
    if (!body) return false;
    if (!body.startsWith('## ')) return true;
    if (/신규 항목 없음/.test(body)) return false;
    return /^### /m.test(body);
  });
  const result = kept.join('').trim();
  return result ? `${result}\n` : '\n';
}

/** 생성된 일일 리서치에서 기수집 항목 제거 (같은 응답 안 중복도 제거) */
export function stripDuplicates(content: string, known: KnownItem[]): DedupResult {
  const seen: KnownItem[] = [...known];
  const lines = content.split('\n');
  const out: string[] = [];
  let i = 0;
  let removedCount = 0;
  let remainingCount = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^## 참고 출처/.test(line.trim())) break;

    if (/^### /.test(line)) {
      const blockLines = [line];
      i++;
      while (
        i < lines.length &&
        !/^### /.test(lines[i]) &&
        !/^## /.test(lines[i]) &&
        !/^[-*] /.test(lines[i])
      ) {
        blockLines.push(lines[i]);
        i++;
      }
      const block = blockLines.join('\n');

      if (isKnownBlock(block, seen)) {
        removedCount++;
        console.log(`  ↩ 중복 제거: ${headlineFromBlock(block) ?? block.slice(0, 60)}…`);
        continue;
      }

      if (!isPlaceholderItem(block) && extractLinks(block).length > 0) {
        remainingCount++;
        seen.push(...knownFromBlock('new', block));
      }
      out.push(...blockLines);
      continue;
    }

    if (/^[-*] /.test(line)) {
      const blockLines = [line];
      i++;
      while (i < lines.length && !/^[-*] /.test(lines[i]) && !/^## /.test(lines[i])) {
        blockLines.push(lines[i]);
        i++;
      }
      const block = blockLines.join('\n');

      if (isKnownBlock(block, seen)) {
        removedCount++;
        console.log(`  ↩ 중복 제거: ${headlineFromBlock(block) ?? block.slice(0, 60)}…`);
        continue;
      }

      if (!isPlaceholderItem(block) && extractLinks(block).length > 0) {
        remainingCount++;
        seen.push(...knownFromBlock('new', block));
      }
      out.push(...blockLines);
      continue;
    }

    out.push(line);
    i++;
  }

  let result = out.join('\n').trimEnd();
  result = stripSourcesSection(result);
  result = stripEmptyAxes(result);

  const remaining = splitNewsItems(result).filter((b) => extractLinks(b).length > 0).length;
  remainingCount = remaining;

  if (remainingCount === 0 && removedCount > 0) {
    result = '\n';
  }

  return { content: result.trim() ? `${result.trim()}\n` : '\n', removedCount, remainingCount };
}

function stripSourcesSection(body: string): string {
  const trimmed = body.replace(/\n## 참고 출처[\s\S]*$/, '').trimEnd();
  return trimmed ? `${trimmed}\n` : '\n';
}

function formatKnownLine(k: KnownItem): string {
  return k.url ? `- [${k.date}] ${k.headline} → ${k.url}` : `- [${k.date}] ${k.headline}`;
}

function uniqueKnown(known: KnownItem[]): KnownItem[] {
  const unique = new Map<string, KnownItem>();
  for (const item of known) {
    const key = `${item.url}::${normalizeHeadline(item.headline)}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()];
}

/**
 * 프롬프트용 수집 목록.
 * todayIso가 있으면 오늘 분은 한도 없이 전부 넣고, 이전 분은 maxRest건만.
 */
export function formatKnownForPrompt(
  known: KnownItem[],
  maxRest = 80,
  todayIso?: string
): string {
  if (known.length === 0) return '(없음)';

  const unique = uniqueKnown(known);

  if (!todayIso) {
    return unique.slice(-maxRest).map(formatKnownLine).join('\n');
  }

  const today = unique.filter((k) => k.date === todayIso);
  const rest = unique.filter((k) => k.date !== todayIso).slice(-maxRest);

  const todayBlock =
    today.length > 0
      ? today.map(formatKnownLine).join('\n')
      : '(아직 없음 — 오늘 첫 수집)';
  const restBlock = rest.length > 0 ? rest.map(formatKnownLine).join('\n') : '(없음)';

  return [
    `### 오늘 ${todayIso} 이미 수집 ${today.length}건 (같은 사건·다른 매체 URL도 금지)`,
    todayBlock,
    `### 이전 수집 ${rest.length}건`,
    restBlock,
  ].join('\n');
}

export function logKnownSummary(known: KnownItem[], todayIso?: string): void {
  const urls = new Set(known.map((k) => k.url).filter(Boolean));
  const today = todayIso ? known.filter((k) => k.date === todayIso).length : 0;
  const todayNote = todayIso ? `, 오늘 ${today}건` : '';
  console.log(`📋 중복 체크 (Notion 최근 1달): ${known.length}건 (URL ${urls.size}개${todayNote})`);
}
