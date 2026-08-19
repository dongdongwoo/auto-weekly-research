/**
 * 다이제스트 마크다운을 노션 블록으로 변환한다.
 * - ## 섹션(축) → 토글 (날짜 토글 안 1단)
 * - ### 기사 → heading_3 + 문단/콜아웃 (토글 중첩 제한 회피)
 * - **요약** / **분석** / **출처** → 문단·콜아웃
 */

import { normalizeDigestMarkdown } from './newsItems.js';

type RichText = {
  type: 'text';
  text: { content: string; link?: { url: string } | null };
  annotations?: { bold?: boolean };
};

export type NotionBlock = Record<string, unknown>;

const MAX_TEXT = 2000;

type MdLine = {
  kind: 'h2' | 'h3' | 'bullet' | 'numbered' | 'paragraph';
  text: string;
  indent: number;
};

/** **볼드**와 [텍스트](URL)를 노션 rich_text 배열로 토크나이즈 */
export function toRichText(line: string): RichText[] {
  const out: RichText[] = [];
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
      out.push({ type: 'text', text: { content: m[1].slice(0, MAX_TEXT), link: { url: m[2] } } });
    } else if (m[3]) {
      out.push({ type: 'text', text: { content: m[3].slice(0, MAX_TEXT) }, annotations: { bold: true } });
    }
    last = m.index + m[0].length;
  }
  if (last < line.length) pushPlain(line.slice(last));
  return out.length ? out : [{ type: 'text', text: { content: '' } }];
}

function parseLine(raw: string): MdLine | null {
  const line = raw.trimEnd();
  if (!line.trim()) return null;

  const indent = raw.match(/^\s*/)?.[0].length ?? 0;

  if (/^## /.test(line.trim())) {
    return { kind: 'h2', text: line.trim().slice(3), indent: 0 };
  }
  if (/^### /.test(line.trim())) {
    return { kind: 'h3', text: line.trim().slice(4), indent: 0 };
  }
  if (/^[-*] /.test(line.trim())) {
    return { kind: 'bullet', text: line.trim().replace(/^[-*] /, ''), indent };
  }
  if (/^\d+\. /.test(line.trim())) {
    return { kind: 'numbered', text: line.trim().replace(/^\d+\. /, ''), indent };
  }
  return { kind: 'paragraph', text: line.trim(), indent: 0 };
}

function heading2(text: string): NotionBlock {
  return { object: 'block', type: 'heading_2', heading_2: { rich_text: toRichText(text) } };
}

function heading3(text: string): NotionBlock {
  return { object: 'block', type: 'heading_3', heading_3: { rich_text: toRichText(text) } };
}

function paragraph(text: string): NotionBlock {
  return { object: 'block', type: 'paragraph', paragraph: { rich_text: toRichText(text) } };
}

function bulletItem(text: string, children: NotionBlock[] = []): NotionBlock {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: {
      rich_text: toRichText(text),
      ...(children.length > 0 ? { children } : {}),
    },
  };
}

function numberedItem(text: string, children: NotionBlock[] = []): NotionBlock {
  return {
    object: 'block',
    type: 'numbered_list_item',
    numbered_list_item: {
      rich_text: toRichText(text),
      ...(children.length > 0 ? { children } : {}),
    },
  };
}

function callout(text: string, emoji: string): NotionBlock {
  return {
    object: 'block',
    type: 'callout',
    callout: {
      rich_text: toRichText(text) as unknown as RichText[],
      icon: { type: 'emoji', emoji },
    },
  };
}

function labeledLineToBlock(text: string): NotionBlock {
  const trimmed = text.trim();
  if (/^\*\*요약\*\*/.test(trimmed) || /^요약\s*[·:]/.test(trimmed)) {
    return paragraph(trimmed.replace(/^\*\*요약\*\*\s*[·—]?\s*/, '**요약** · '));
  }
  if (/^\*\*분석\*\*/.test(trimmed) || /^분석\s*[·:]/.test(trimmed)) {
    const body = trimmed.replace(/^\*\*분석\*\*\s*[·—]?\s*/, '');
    return callout(body, '💡');
  }
  if (/^\*\*출처\*\*/.test(trimmed) || /^출처\s*[·:]/.test(trimmed)) {
    return paragraph(trimmed.replace(/^\*\*출처\*\*\s*[·—]?\s*/, '**🔗 출처** · '));
  }
  if (/^\*\*근거\*\*/.test(trimmed)) {
    return paragraph(trimmed.replace(/^\*\*근거\*\*\s*[·—]?\s*/, '**근거** · '));
  }
  if (/^\*\*전망\*\*/.test(trimmed)) {
    return callout(trimmed.replace(/^\*\*전망\*\*\s*[·—]?\s*/, ''), '🔭');
  }
  if (/^\*\*내용\*\*/.test(trimmed) || /^\*\*시사점\*\*/.test(trimmed)) {
    return paragraph(trimmed);
  }
  return paragraph(trimmed);
}

/** ### 기사 → heading_3 + 요약/분석/출처 (Notion은 토글 2단까지만 허용) */
function newsItemToBlocks(title: string, lines: MdLine[]): NotionBlock[] {
  const cleanTitle = title.replace(/^\[|\]$/g, '').replace(/\*\*/g, '');
  const blocks: NotionBlock[] = [heading3(cleanTitle)];

  for (const line of lines) {
    if (line.kind === 'paragraph' || line.kind === 'bullet') {
      blocks.push(labeledLineToBlock(line.text));
    } else {
      blocks.push(...linesToBlocks([line]));
    }
  }
  return blocks;
}

function toggle(title: string, children: NotionBlock[]): NotionBlock {
  return {
    object: 'block',
    type: 'toggle',
    toggle: {
      rich_text: toRichText(title),
      ...(children.length > 0 ? { children } : {}),
    },
  };
}

/** 섹션 본문: ### 기사 블록 + 나머지 */
function sectionLinesToBlocks(lines: MdLine[]): NotionBlock[] {
  const blocks: NotionBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    if (lines[i].kind === 'h3') {
      const title = lines[i].text;
      const bodyLines: MdLine[] = [];
      i++;
      while (i < lines.length && lines[i].kind !== 'h3') {
        bodyLines.push(lines[i]);
        i++;
      }
      blocks.push(...newsItemToBlocks(title, bodyLines));
      continue;
    }

    const run: MdLine[] = [];
    while (i < lines.length && lines[i].kind !== 'h3') {
      run.push(lines[i]);
      i++;
    }
    blocks.push(...linesToBlocks(run));
  }

  return blocks;
}

/** 들여쓰기 불릿·번호 목록을 중첩 블록으로 변환 */
function parseListAt(
  lines: MdLine[],
  start: number,
  listKind: 'bullet' | 'numbered'
): { blocks: NotionBlock[]; next: number } {
  const blocks: NotionBlock[] = [];
  let i = start;

  while (i < lines.length && lines[i].kind === listKind) {
    const item = lines[i];
    const itemIndent = item.indent;
    i++;

    const childLines: MdLine[] = [];
    while (i < lines.length && lines[i].kind === listKind && lines[i].indent > itemIndent) {
      childLines.push(lines[i]);
      i++;
    }

    let children: NotionBlock[] = [];
    if (childLines.length > 0) {
      const minIndent = Math.min(...childLines.map((l) => l.indent));
      const normalized = childLines.map((l) => ({ ...l, indent: l.indent - minIndent }));
      children = parseListAt(normalized, 0, listKind).blocks;
    }

    blocks.push(listKind === 'bullet' ? bulletItem(item.text, children) : numberedItem(item.text, children));
  }

  return { blocks, next: i };
}

function linesToBlocks(lines: MdLine[]): NotionBlock[] {
  const blocks: NotionBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.kind === 'h3') {
      blocks.push(heading3(line.text));
      i++;
      continue;
    }

    if (line.kind === 'bullet') {
      const { blocks: listBlocks, next } = parseListAt(lines, i, 'bullet');
      blocks.push(...listBlocks);
      i = next;
      continue;
    }

    if (line.kind === 'numbered') {
      const { blocks: listBlocks, next } = parseListAt(lines, i, 'numbered');
      blocks.push(...listBlocks);
      i = next;
      continue;
    }

    if (line.kind === 'paragraph') {
      blocks.push(paragraph(line.text));
    }
    i++;
  }

  return blocks;
}

/** 문서 제목 섹션 — 토글 대신 헤딩만 */
function isDocTitleSection(title: string): boolean {
  return /일일 리서치|주간 인사이트/.test(title);
}

function sectionToBlock(title: string, lines: MdLine[]): NotionBlock {
  if (isDocTitleSection(title)) {
    return heading2(title);
  }
  const body = sectionLinesToBlocks(lines);
  if (body.length === 0) {
    return heading2(title);
  }
  return toggle(title, body);
}

function parseSections(md: string): { preamble: MdLine[]; sections: { title: string; lines: MdLine[] }[] } {
  const preamble: MdLine[] = [];
  const sections: { title: string; lines: MdLine[] }[] = [];
  let current: { title: string; lines: MdLine[] } | null = null;

  for (const raw of md.split('\n')) {
    const parsed = parseLine(raw);
    if (!parsed) continue;

    if (parsed.kind === 'h2') {
      if (current) sections.push(current);
      current = { title: parsed.text, lines: [] };
      continue;
    }

    if (current) {
      if (parsed.kind === 'h3') {
        current.lines.push(parsed);
      } else if (parsed.kind === 'bullet' || parsed.kind === 'numbered' || parsed.kind === 'paragraph') {
        current.lines.push(parsed);
      }
    } else {
      preamble.push(parsed);
    }
  }

  if (current) sections.push(current);
  return { preamble, sections };
}

export function markdownToBlocks(md: string): NotionBlock[] {
  const normalized = normalizeDigestMarkdown(md);
  const { preamble, sections } = parseSections(normalized);
  const blocks: NotionBlock[] = linesToBlocks(preamble);

  for (const { title, lines } of sections) {
    blocks.push(sectionToBlock(title, lines));
  }

  return blocks;
}

/** 중첩 포함 블록 개수 (로깅용) */
export function countBlocks(blocks: NotionBlock[]): number {
  let n = 0;
  for (const b of blocks) {
    n++;
    const key = Object.keys(b).find((k) => k !== 'object' && k !== 'type' && typeof b[k] === 'object');
    if (!key) continue;
    const node = b[key] as { children?: NotionBlock[] };
    if (node.children?.length) n += countBlocks(node.children);
  }
  return n;
}
