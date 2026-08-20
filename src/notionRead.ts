import { config } from './config.js';
import { notion } from './notion.js';
import { isoWeekId, weekNewsDates } from './kst.js';
import { isProductName } from './prompt.js';

type NotionRichText = {
  plain_text?: string;
  text?: { content: string; link?: { url: string } | null };
  annotations?: { bold?: boolean };
};

type NotionBlock = {
  id: string;
  type: string;
  [key: string]: unknown;
};

const DATE_TOGGLE_RE = /📰\s*(\d{4}-\d{2}-\d{2})/;
const WEEK_PAGE_RE = /📊\s+(20\d\d-W\d{2})/;

function richTextToMarkdown(rich: NotionRichText[]): string {
  return rich
    .map((rt) => {
      const text = rt.plain_text ?? rt.text?.content ?? '';
      const url = rt.text?.link?.url;
      const bold = rt.annotations?.bold;
      if (url) return `[${text}](${url})`;
      if (bold) return `**${text}**`;
      return text;
    })
    .join('');
}

function toggleTitle(block: NotionBlock): string {
  const node = block.toggle as { rich_text?: NotionRichText[] };
  return richTextToMarkdown(node?.rich_text ?? []).replace(/\*\*/g, '');
}

async function fetchAllBlocks(blockId: string): Promise<NotionBlock[]> {
  const blocks: NotionBlock[] = [];
  let cursor: string | undefined;

  do {
    const res = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
    });
    blocks.push(...(res.results as NotionBlock[]));
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return blocks;
}

async function blockToMarkdownLines(
  block: NotionBlock,
  bulletDepth = 0,
  ctx: { inAxis?: boolean } = {}
): Promise<string[]> {
  const lines: string[] = [];
  const prefix = '  '.repeat(bulletDepth);

  switch (block.type) {
    case 'toggle': {
      const title = toggleTitle(block);
      if (/^📰|^📊/.test(title)) {
        for (const child of await fetchAllBlocks(block.id)) {
          lines.push(...(await blockToMarkdownLines(child, bulletDepth, ctx)));
        }
        break;
      }
      if (isProductName(title)) {
        lines.push(`### ${title}`);
        for (const child of await fetchAllBlocks(block.id)) {
          lines.push(...(await blockToMarkdownLines(child, bulletDepth, ctx)));
        }
        break;
      }
      if (ctx.inAxis) {
        lines.push(`### ${title}`);
        for (const child of await fetchAllBlocks(block.id)) {
          lines.push(...(await blockToMarkdownLines(child, bulletDepth, { inAxis: false })));
        }
      } else {
        lines.push(`## ${title}`);
        for (const child of await fetchAllBlocks(block.id)) {
          lines.push(...(await blockToMarkdownLines(child, bulletDepth, { inAxis: true })));
        }
      }
      break;
    }
    case 'heading_2':
      lines.push(`## ${richTextToMarkdown((block.heading_2 as { rich_text: NotionRichText[] }).rich_text)}`);
      break;
    case 'heading_3':
      lines.push(`### ${richTextToMarkdown((block.heading_3 as { rich_text: NotionRichText[] }).rich_text)}`);
      break;
    case 'bulleted_list_item': {
      const text = richTextToMarkdown(
        (block.bulleted_list_item as { rich_text: NotionRichText[] }).rich_text
      );
      lines.push(`${prefix}- ${text}`);
      for (const child of await fetchAllBlocks(block.id)) {
        lines.push(...(await blockToMarkdownLines(child, bulletDepth + 1, ctx)));
      }
      break;
    }
    case 'numbered_list_item': {
      const text = richTextToMarkdown(
        (block.numbered_list_item as { rich_text: NotionRichText[] }).rich_text
      );
      lines.push(`${prefix}1. ${text}`);
      for (const child of await fetchAllBlocks(block.id)) {
        lines.push(...(await blockToMarkdownLines(child, bulletDepth + 1, ctx)));
      }
      break;
    }
    case 'callout': {
      const node = block.callout as { rich_text: NotionRichText[]; icon?: { emoji?: string } };
      const text = richTextToMarkdown(node.rich_text);
      const emoji = node.icon?.emoji;
      if (!text.trim()) break;
      if (emoji === '🔭') lines.push(`**체크포인트** · ${text}`);
      else if (emoji === '👀') lines.push(`**주시** · ${text}`);
      else if (emoji === '🎯') lines.push(`**액션** · ${text}`);
      else if (emoji === '🔗') lines.push(`**관찰** · ${text}`);
      else if (emoji === '🧭') lines.push(`**해석** · ${text}`);
      else lines.push(`**분석** · ${text}`);
      break;
    }
    case 'paragraph': {
      const text = richTextToMarkdown((block.paragraph as { rich_text: NotionRichText[] }).rich_text);
      if (text.trim()) lines.push(text);
      break;
    }
    default:
      break;
  }

  return lines;
}

/** Notion 블록 트리 → 마크다운 (중복 제거·주간 인사이트 입력용) */
export async function blocksToMarkdown(blockId: string): Promise<string> {
  const blocks = await fetchAllBlocks(blockId);
  const lines: string[] = [];
  for (const block of blocks) {
    lines.push(...(await blockToMarkdownLines(block)));
  }
  return lines.join('\n').trim();
}

export type HubChildPage = { id: string; title: string; weekId: string | null };

/** 허브 페이지 아래 주간 하위 페이지 목록 */
export async function listHubChildPages(): Promise<HubChildPage[]> {
  const pages: HubChildPage[] = [];
  let cursor: string | undefined;

  do {
    const res = await notion.blocks.children.list({
      block_id: config.notionPageId,
      start_cursor: cursor,
    });

    for (const block of res.results as NotionBlock[]) {
      if (block.type !== 'child_page') continue;
      const title = (block.child_page as { title: string }).title;
      const weekMatch = title.match(WEEK_PAGE_RE);
      pages.push({ id: block.id, title, weekId: weekMatch?.[1] ?? null });
    }

    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return pages;
}

export async function findWeekPageId(weekId: string): Promise<string | null> {
  const pages = await listHubChildPages();
  return pages.find((p) => p.weekId === weekId)?.id ?? null;
}

type DailyToggle = { iso: string; blockId: string };

/** 주간 페이지 최상위 📰 날짜 토글 목록 */
export async function listDailyToggles(weekPageId: string): Promise<DailyToggle[]> {
  const toggles: DailyToggle[] = [];
  const blocks = await fetchAllBlocks(weekPageId);

  for (const block of blocks) {
    if (block.type !== 'toggle') continue;
    const title = toggleTitle(block);
    const m = title.match(DATE_TOGGLE_RE);
    if (m) toggles.push({ iso: m[1], blockId: block.id });
  }

  return toggles;
}

/** 주간 페이지에서 특정 날짜 일일 리서치 읽기 */
export async function readDailyMarkdown(
  weekPageId: string,
  newsIso: string
): Promise<string | null> {
  const toggles = await listDailyToggles(weekPageId);
  const toggle = toggles.find((t) => t.iso === newsIso);
  if (!toggle) return null;
  const md = await blocksToMarkdown(toggle.blockId);
  return md.length > 0 ? md : null;
}

/** 해당 주(월~일) 일일 수집본 — Notion에서 읽기 */
export async function readWeekDaily(
  weekAnchorIso: string
): Promise<{ iso: string; content: string }[]> {
  const weekId = isoWeekId(weekAnchorIso);
  const pageId = await findWeekPageId(weekId);
  if (!pageId) return [];

  const dates = weekNewsDates(weekAnchorIso);
  const toggles = await listDailyToggles(pageId);
  const byIso = new Map(toggles.map((t) => [t.iso, t.blockId]));

  const logs: { iso: string; content: string }[] = [];
  for (const iso of dates) {
    const blockId = byIso.get(iso);
    if (!blockId) continue;
    const content = await blocksToMarkdown(blockId);
    if (content.length > 0) logs.push({ iso, content });
  }
  return logs;
}

function cutoffIso(beforeIso: string, lookbackDays: number): string {
  const [y, m, d] = beforeIso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - lookbackDays);
  return date.toISOString().slice(0, 10);
}

/** 최근 N일 일일 리서치 — 중복 체크용 (Notion 1달치) */
export async function fetchDailyLogsInRange(
  fromIso: string,
  beforeIso: string
): Promise<{ iso: string; content: string }[]> {
  const pages = await listHubChildPages();
  const weekPages = pages.filter((p) => p.weekId !== null);
  const logs: { iso: string; content: string }[] = [];

  for (const page of weekPages) {
    const toggles = await listDailyToggles(page.id);
    for (const toggle of toggles) {
      if (toggle.iso < fromIso || toggle.iso >= beforeIso) continue;
      const content = await blocksToMarkdown(toggle.blockId);
      if (content.length > 0) logs.push({ iso: toggle.iso, content });
    }
  }

  logs.sort((a, b) => a.iso.localeCompare(b.iso));
  return logs;
}

export { cutoffIso };
