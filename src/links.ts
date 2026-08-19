/** 마크다운 본문의 출처 링크 검증 — 할루시네이션 방지용 */

const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

export function extractLinks(md: string): { label: string; url: string }[] {
  const out: { label: string; url: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = LINK_RE.exec(md)) !== null) {
    out.push({ label: m[1], url: m[2] });
  }
  return out;
}

/** 불릿 항목마다 링크가 있어야 한다. 신규 없음/해당 없음만 있으면 통과 */
export function assertSourceLinks(md: string, label: string): void {
  if (/신규 항목 없음/.test(md)) {
    console.log(`🔗 ${label}: 신규 항목 없음 — 출처 검증 생략`);
    return;
  }

  const links = extractLinks(md);
  const contentBullets = md
    .split('\n')
    .filter((l) => /^[-*] /.test(l.trim()))
    .filter((b) => !/해당 없음/.test(b));

  if (contentBullets.length === 0) {
    console.log(`🔗 ${label}: 수집 항목 없음 — 출처 검증 생략`);
    return;
  }

  if (links.length === 0) {
    throw new Error(`${label}: 출처 링크가 하나도 없습니다. 재생성이 필요합니다.`);
  }

  const bulletsWithoutLink = contentBullets.filter((b) => !/\[[^\]]+\]\(https?:\/\//.test(b));

  if (bulletsWithoutLink.length > 0) {
    throw new Error(
      `${label}: 링크 없는 불릿 ${bulletsWithoutLink.length}개 — 모든 항목에 [출처](URL) 필수`
    );
  }

  console.log(`🔗 출처 검증 통과: 링크 ${links.length}개, 불릿 ${contentBullets.length}개`);
}
