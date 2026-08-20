/** 마크다운 본문의 출처 링크 검증 — 할루시네이션 방지용 */

import { splitNewsItems, isPlaceholderItem, itemRequiresLink } from './newsItems.js';

const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

export function extractLinks(md: string): { label: string; url: string }[] {
  const out: { label: string; url: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = LINK_RE.exec(md)) !== null) {
    out.push({ label: m[1], url: m[2] });
  }
  return out;
}

/** 최상위 불릿 블록 분리 (하위 들여쓰기 줄 포함) */
export function splitTopLevelBullets(md: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of md.split('\n')) {
    if (/^[-*] /.test(line)) {
      if (current.length) blocks.push(current.join('\n'));
      current = [line];
    } else if (current.length) {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current.join('\n'));
  return blocks;
}

function isPlaceholderBlock(block: string): boolean {
  return /해당 없음|신규 항목 없음|\(신규 없음\)/.test(block);
}

/** 참고 출처 섹션은 검증 제외 */
function bodyWithoutSourcesSection(md: string): string {
  return md.replace(/\n## 참고 출처[\s\S]*$/, '');
}

/**
 * 수집 항목마다 최소 1개 출처 링크 필요.
 * 헤드라인 / 분석 / 출처가 각각 불릿이어도 한 항목으로 묶어 검사.
 */
export function assertSourceLinks(md: string, label: string): void {
  if (/신규 항목 없음/.test(md)) {
    console.log(`🔗 ${label}: 신규 항목 없음 — 출처 검증 생략`);
    return;
  }

  const body = bodyWithoutSourcesSection(md);
  const items = splitNewsItems(body);

  if (items.length === 0) {
    console.log(`🔗 ${label}: 수집 항목 없음 — 출처 검증 생략`);
    return;
  }

  const withoutLink = items.filter((item) => itemRequiresLink(item));

  if (withoutLink.length > 0) {
    throw new Error(
      `${label}: 출처 링크 없는 항목 ${withoutLink.length}개 — 각 뉴스에 **출처** · [매체](URL) 필수`
    );
  }

  const links = extractLinks(body);
  console.log(`🔗 출처 검증 통과: 항목 ${items.length}개, 링크 ${links.length}개`);
}
