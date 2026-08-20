/** 일일 리서치 뉴스 항목 파싱 (### 형식 + 구형 불릿 형식) */

export function splitNewsItems(md: string): string[] {
  const body = md.replace(/\n## 참고 출처[\s\S]*$/, '');
  const items: string[] = [];
  let current: string[] = [];

  for (const line of body.split('\n')) {
    if (/^### /.test(line) || /^[-*] \*\*\[/.test(line)) {
      if (current.length) items.push(current.join('\n').trim());
      current = [line];
    } else if (/^## /.test(line)) {
      if (current.length) {
        items.push(current.join('\n').trim());
        current = [];
      }
    } else if (current.length) {
      current.push(line);
    }
  }
  if (current.length) items.push(current.join('\n').trim());
  return items.filter((item) => item.length > 0 && !isPlaceholderItem(item));
}

export function isPlaceholderItem(item: string): boolean {
  return /해당 없음|신규 항목 없음|\(신규 없음\)/.test(item);
}

export function itemRequiresLink(item: string): boolean {
  if (isPlaceholderItem(item)) return false;
  if (/\[[^\]]+\]\(https?:\/\//.test(item)) return false;

  const fields = item.match(/\*\*[^*]+\*\*\s*[·—]\s*(.+)/g) ?? [];
  if (fields.length > 0 && fields.every((f) => /해당 없음/.test(f))) return false;
  return true;
}

export function headlineFromItem(item: string): string | null {
  const h3 = item.match(/^### (.+)$/m);
  if (h3) return h3[1].replace(/^\[|\]$/g, '').trim();
  const bullet = item.match(/\*\*\[([^\]]+)\]\*\*/);
  if (bullet) return bullet[1].trim();
  const bold = item.match(/^\*\*([^*]+)\*\*/);
  if (bold) return bold[1].trim();
  return null;
}

/** 구형 한 줄 불릿 → ### + 요약/분석/출처 3줄 */
export function normalizeDigestMarkdown(md: string): string {
  let text = md.replace(/^## \d{4}-\d{2}-\d{2} 일일 리서치\s*\n?/gm, '');

  const out: string[] = [];
  for (const raw of text.split('\n')) {
    const compact = raw.match(/^[-*] \*\*\[([^\]]+)\]\*\*\s*[—–-]\s*(.+)$/);
    if (!compact) {
      out.push(raw);
      continue;
    }

    const [, headline, rest] = compact;
    const parts = splitCompactBody(rest);
    out.push(`### ${headline}`);
    if (parts.summary) out.push(`**요약** · ${parts.summary}`);
    if (parts.analysis) out.push(`**분석** · ${parts.analysis}`);
    if (parts.source) out.push(`**출처** · ${parts.source}`);
  }

  return out.join('\n').trim() + '\n';
}

function splitCompactBody(rest: string): { summary?: string; analysis?: string; source?: string } {
  let body = rest.trim();

  const sourceMatch = body.match(/(?:\*\*출처\*\*|출처)\s*[·:—–-]\s*(.+)$/);
  let source = sourceMatch?.[1]?.trim();
  if (sourceMatch) body = body.slice(0, sourceMatch.index).trim();

  const analysisMatch = body.match(/(?:\*\*분석\*\*|분석)\s*[—–-]\s*(.+)$/s);
  let analysis = analysisMatch?.[1]?.trim();
  let summary = body;
  if (analysisMatch) {
    summary = body.slice(0, analysisMatch.index).trim();
    summary = summary.replace(/[—–-]\s*$/, '').trim();
  }

  return {
    summary: summary || undefined,
    analysis: analysis || undefined,
    source: source || undefined,
  };
}
