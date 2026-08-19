import { extractLinks } from './links.js';
import { fetchDailyLogsInRange, cutoffIso } from './notionRead.js';
import { splitNewsItems, headlineFromItem, isPlaceholderItem } from './newsItems.js';

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

/** URL 비교용 정규화 (utm 제거, trailing slash, 소문자) */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((k) =>
      u.searchParams.delete(k)
    );
    u.hostname = u.hostname.replace(/^www\./, '').toLowerCase();
    let path = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.protocol}//${u.hostname}${path}${u.search}`;
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

/** 불릿/### 블록에서 헤드라인 추출 */
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

/** 수집 대상 날짜 이전 N일간 Notion에 이미 수집된 URL·헤드라인 */
export async function loadKnownItems(
  beforeDateIso: string,
  lookbackDays: number
): Promise<KnownItem[]> {
  const cutoff = cutoffIso(beforeDateIso, lookbackDays);
  const items: KnownItem[] = [];
  const logs = await fetchDailyLogsInRange(cutoff, beforeDateIso);

  for (const { iso, content } of logs) {
    for (const block of splitNewsItems(content)) {
      if (isPlaceholderItem(block)) continue;
      const headline = headlineFromBlock(block);
      for (const { url } of extractLinks(block)) {
        items.push({
          date: iso,
          url: normalizeUrl(url),
          headline: headline ?? url,
        });
      }
    }
  }

  return items;
}

function isPlaceholderBullet(block: string): boolean {
  return isPlaceholderItem(block);
}

function isKnownBlock(block: string, known: KnownItem[]): boolean {
  if (isPlaceholderItem(block)) return false;

  const headline = headlineFromBlock(block);
  const urls = extractLinks(block).map((l) => normalizeUrl(l.url));

  for (const k of known) {
    if (urls.some((u) => u === k.url)) return true;
    if (headline && isSimilarHeadline(headline, k.headline)) return true;
  }
  return false;
}

/** 생성된 일일 리서치에서 기수집 항목 제거 */
export function stripDuplicates(content: string, known: KnownItem[]): DedupResult {
  const lines = content.split('\n');
  const out: string[] = [];
  let i = 0;
  let removedCount = 0;
  let remainingCount = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^## 참고 출처/.test(line.trim())) break;

    // ### 뉴스 항목 블록
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

      if (isKnownBlock(block, known)) {
        removedCount++;
        console.log(`  ↩ 중복 제거: ${headlineFromBlock(block) ?? block.slice(0, 60)}…`);
        continue;
      }

      if (!isPlaceholderItem(block) && extractLinks(block).length > 0) {
        remainingCount++;
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

      if (isKnownBlock(block, known)) {
        removedCount++;
        console.log(`  ↩ 중복 제거: ${headlineFromBlock(block) ?? block.slice(0, 60)}…`);
        continue;
      }

      if (!isPlaceholderItem(block) && extractLinks(block).length > 0) {
        remainingCount++;
      }
      out.push(...blockLines);
      continue;
    }

    out.push(line);
    i++;
  }

  let result = out.join('\n').trimEnd();

  if (remainingCount === 0 && removedCount > 0) {
    result = appendNoNewItemsNotice(result);
  } else {
    result = stripSourcesSection(result);
  }

  return { content: result.trim() + '\n', removedCount, remainingCount };
}

function stripSourcesSection(body: string): string {
  const trimmed = body.replace(/\n## 참고 출처[\s\S]*$/, '').trimEnd();
  return trimmed ? trimmed + '\n' : '\n';
}

function appendNoNewItemsNotice(body: string): string {
  const trimmed = body.trimEnd();
  const notice = ['', '## 요약', '- 이전 수집과 **중복** — 오늘 날짜 기준 **신규 항목 없음**'].join('\n');
  return trimmed + '\n' + notice + '\n';
}

/** 프롬프트용 — 최근 수집 목록 요약 */
export function formatKnownForPrompt(known: KnownItem[], maxItems = 80): string {
  if (known.length === 0) return '(없음)';

  const unique = new Map<string, KnownItem>();
  for (const item of known) {
    const key = `${item.url}::${normalizeHeadline(item.headline)}`;
    if (!unique.has(key)) unique.set(key, item);
  }

  return [...unique.values()]
    .slice(-maxItems)
    .map((k) => `- [${k.date}] ${k.headline} → ${k.url}`)
    .join('\n');
}

export function logKnownSummary(known: KnownItem[]): void {
  const urls = new Set(known.map((k) => k.url));
  console.log(`📋 중복 체크 (Notion 최근 1달): ${known.length}건 (URL ${urls.size}개)`);
}
