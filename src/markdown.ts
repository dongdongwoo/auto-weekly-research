/**
 * 다이제스트 마크다운을 노션 블록으로 변환한다.
 * - ## 섹션(축) → 토글 (날짜 토글 안 1단)
 * - ### 기사 → heading_3 + 문단/콜아웃 (토글 중첩 제한 회피)
 * - **요약** / **분석** / **출처** → 문단·콜아웃
 */

import { isProductName } from './prompt.js';
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
    return paragraph(trimmed.replace(/^\*\*출처\*\*\s*[·—]?\s*/, '**출처** · '));
  }
  if (/^\*\*근거\*\*/.test(trimmed)) {
    return paragraph(trimmed.replace(/^\*\*근거\*\*\s*[·—]?\s*/, '**근거** · '));
  }
  if (/^\*\*전망\*\*/.test(trimmed)) {
    return callout(trimmed.replace(/^\*\*전망\*\*\s*[·—]?\s*/, ''), '🔭');
  }
  if (/^\*\*사실\*\*/.test(trimmed) && /[·—]/.test(trimmed)) {
    const body = trimmed.replace(/^\*\*사실\*\*\s*[·—]?\s*/, '');
    return paragraph(`**사실**\n${body}`);
  }
  if (/^\*\*왜 주목\*\*/.test(trimmed) && /[·—]/.test(trimmed)) {
    const body = trimmed.replace(/^\*\*왜 주목\*\*\s*[·—]?\s*/, '');
    return paragraph(`**왜 주목**\n${body}`);
  }
  if (/^\*\*기술\*\*/.test(trimmed)) {
    return paragraph(trimmed.replace(/^\*\*기술\*\*\s*[·—]?\s*/, '**기술** · '));
  }
  if (/^\*\*규제\*\*/.test(trimmed)) {
    return paragraph(trimmed.replace(/^\*\*규제\*\*\s*[·—]?\s*/, '**규제** · '));
  }
  if (/^\*\*비즈니스\*\*/.test(trimmed)) {
    return paragraph(trimmed.replace(/^\*\*비즈니스\*\*\s*[·—]?\s*/, '**비즈니스** · '));
  }
  if (/^\*\*관찰\*\*/.test(trimmed)) {
    const body = trimmed.replace(/^\*\*관찰\*\*\s*[·—]?\s*/, '');
    return callout(body, '🔗');
  }
  if (/^\*\*해석\*\*/.test(trimmed)) {
    const body = trimmed.replace(/^\*\*해석\*\*\s*[·—]?\s*/, '');
    return callout(body, '🧭');
  }
  if (/^\*\*시사\*\*/.test(trimmed)) {
    return paragraph(trimmed.replace(/^\*\*시사\*\*\s*[·—]?\s*/, '**시사** · '));
  }
  if (/^\*\*트리거\*\*/.test(trimmed)) {
    return paragraph(trimmed.replace(/^\*\*트리거\*\*\s*[·—]?\s*/, '**트리거** · '));
  }
  if (/^\*\*체크포인트\*\*/.test(trimmed)) {
    return callout(trimmed.replace(/^\*\*체크포인트\*\*\s*[·—]?\s*/, ''), '🔭');
  }
  if (/^\*\*주시\*\*/.test(trimmed)) {
    return callout(trimmed.replace(/^\*\*주시\*\*\s*[·—]?\s*/, ''), '👀');
  }
  if (/^\*\*기회\*\*/.test(trimmed)) {
    return paragraph(trimmed.replace(/^\*\*기회\*\*\s*[·—]?\s*/, '**✅ 기회** · '));
  }
  if (/^\*\*리스크\*\*/.test(trimmed)) {
    return paragraph(trimmed.replace(/^\*\*리스크\*\*\s*[·—]?\s*/, '**⚠️ 리스크** · '));
  }
  if (/^\*\*액션\*\*/.test(trimmed)) {
    const body = trimmed.replace(/^\*\*액션\*\*\s*[·—]?\s*/, '');
    return callout(body, '🎯');
  }
  if (/^\*\*내용\*\*/.test(trimmed) || /^\*\*시사점\*\*/.test(trimmed)) {
    return paragraph(trimmed);
  }
  return paragraph(trimmed);
}

function sectionLabel(text: string): NotionBlock {
  return paragraph(`**${text}**`);
}

function isStandaloneLabel(text: string): '사실' | '왜 주목' | null {
  const t = text.trim();
  if (t === '**사실**' || t === '사실') return '사실';
  if (t === '**왜 주목**' || t === '왜 주목') return '왜 주목';
  return null;
}

/** 주간 주요 이슈 — 라벨(사실/왜 주목) + 본문 분리 */
function weeklyIssueToBlocks(title: string, lines: MdLine[]): NotionBlock[] {
  const cleanTitle = title.replace(/^\[|\]$/g, '').replace(/\*\*/g, '');
  const blocks: NotionBlock[] = [heading3(cleanTitle)];
  let i = 0;

  while (i < lines.length) {
    const label = isStandaloneLabel(lines[i].text);
    if (label) {
      blocks.push(sectionLabel(label));
      i++;
      const body: string[] = [];
      while (i < lines.length) {
        const next = lines[i].text.trim();
        if (isStandaloneLabel(next) || /^\*\*출처\*\*/.test(next) || /^출처\s*[·:]/.test(next)) break;
        body.push(lines[i].text.trim());
        i++;
      }
      if (body.length) blocks.push(paragraph(body.join('\n')));
      continue;
    }
    blocks.push(labeledLineToBlock(lines[i].text));
    i++;
  }
  return blocks;
}

function isWeeklyIssueBlock(lines: MdLine[]): boolean {
  return lines.some((l) => isStandaloneLabel(l.text) !== null);
}

/** ### 기사/이슈 → heading_3 + 본문 블록 */
function newsItemToBlocks(title: string, lines: MdLine[]): NotionBlock[] {
  if (isWeeklyIssueBlock(lines)) return weeklyIssueToBlocks(title, lines);
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

/** 프로덕트 라인 → 토글 (섹션은 heading_2, Notion 토글 2단 제한) */
function productItemToToggle(title: string, lines: MdLine[]): NotionBlock {
  const children: NotionBlock[] = [];
  for (const line of lines) {
    if (line.kind === 'paragraph' || line.kind === 'bullet') {
      children.push(labeledLineToBlock(line.text));
    }
  }
  return toggle(title.replace(/\*\*/g, ''), children);
}

function productSectionLinesToBlocks(lines: MdLine[]): NotionBlock[] {
  const blocks: NotionBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    if (lines[i].kind === 'h3' && isProductName(lines[i].text)) {
      const title = lines[i].text;
      const bodyLines: MdLine[] = [];
      i++;
      while (i < lines.length && !(lines[i].kind === 'h3' && isProductName(lines[i].text))) {
        if (lines[i].kind === 'h3') break;
        bodyLines.push(lines[i]);
        i++;
      }
      if (bodyLines.length > 0) blocks.push(productItemToToggle(title, bodyLines));
      continue;
    }
    i++;
  }
  return blocks;
}

function isProductSection(title: string): boolean {
  return /담당 프로덕트/.test(title);
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

function sectionToBlocks(title: string, lines: MdLine[]): NotionBlock[] {
  if (isDocTitleSection(title)) return [heading2(title)];
  if (isProductSection(title)) {
    const products = productSectionLinesToBlocks(lines);
    if (products.length === 0) return [heading2(title)];
    return [heading2(title), ...products];
  }
  const body = sectionLinesToBlocks(lines);
  if (body.length === 0) return [heading2(title)];
  return [toggle(title, body)];
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
    blocks.push(...sectionToBlocks(title, lines));
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
