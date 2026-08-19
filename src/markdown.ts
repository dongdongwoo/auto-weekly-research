/**
 * 다이제스트 마크다운을 노션 블록으로 변환한다.
 * 지원: ## / ### 헤딩, - 불릿, **볼드**, [텍스트](URL) 링크, 일반 문단.
 * 노션 제약: rich_text 1개당 2000자 제한 → 초과 시 분할.
 */

type RichText = {
  type: 'text';
  text: { content: string; link?: { url: string } | null };
  annotations?: { bold?: boolean };
};

export type NotionBlock = Record<string, unknown>;

const MAX_TEXT = 2000;

/** **볼드**와 [텍스트](URL)를 노션 rich_text 배열로 토크나이즈 */
export function toRichText(line: string): RichText[] {
  const out: RichText[] = [];
  // 링크와 볼드를 함께 잡는 토크나이저
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;

  const pushPlain = (s: string) => {
    for (let i = 0; i < s.length; i += MAX_TEXT) {
      const chunk = s.slice(i, i + MAX_TEXT);
      if (chunk) out.push({ type: 'text', text: { content: chunk } });
    }
  };

  while ((m = pattern.exec(line)) !== null) {
    if (m.index > last) pushPlain(line.slice(last, m.index));
    if (m[1] && m[2]) {
      // 마크다운 링크
      out.push({ type: 'text', text: { content: m[1].slice(0, MAX_TEXT), link: { url: m[2] } } });
    } else if (m[3]) {
      // 볼드
      out.push({ type: 'text', text: { content: m[3].slice(0, MAX_TEXT) }, annotations: { bold: true } });
    }
    last = m.index + m[0].length;
  }
  if (last < line.length) pushPlain(line.slice(last));
  return out.length ? out : [{ type: 'text', text: { content: '' } }];
}

export function markdownToBlocks(md: string): NotionBlock[] {
  const blocks: NotionBlock[] = [];
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;

    if (line.startsWith('### ')) {
      blocks.push({ object: 'block', type: 'heading_3', heading_3: { rich_text: toRichText(line.slice(4)) } });
    } else if (line.startsWith('## ')) {
      blocks.push({ object: 'block', type: 'heading_2', heading_2: { rich_text: toRichText(line.slice(3)) } });
    } else if (line.startsWith('# ')) {
      blocks.push({ object: 'block', type: 'heading_2', heading_2: { rich_text: toRichText(line.slice(2)) } });
    } else if (/^[-*] /.test(line)) {
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: toRichText(line.replace(/^[-*] /, '')) },
      });
    } else if (/^\d+\. /.test(line)) {
      blocks.push({
        object: 'block',
        type: 'numbered_list_item',
        numbered_list_item: { rich_text: toRichText(line.replace(/^\d+\. /, '')) },
      });
    } else {
      blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: toRichText(line) } });
    }
  }
  return blocks;
}
