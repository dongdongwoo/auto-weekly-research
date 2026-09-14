import { Client } from '@notionhq/client';
import { config } from './config.js';
import {
  markdownToBlocks,
  toRichText,
  NotionBlock,
  countBlocks,
  NOTION_CHILD_LIMIT,
} from './markdown.js';

const notion = new Client({ auth: config.notionApiKey });

export { notion };

const CHUNK = NOTION_CHILD_LIMIT;

/** 부모 페이지(NOTION_PAGE_ID) 아래 주간 하위 페이지 생성 */
export async function createWeekPage(title: string): Promise<string> {
  const page = await notion.pages.create({
    parent: { type: 'page_id', page_id: config.notionPageId },
    properties: {
      title: { title: [{ type: 'text', text: { content: title } }] },
    },
    children: [
      {
        object: 'block',
        type: 'callout',
        callout: {
          rich_text: toRichText('**일일 리서치**는 KST 자정에 날짜 토글이 생기고, 이후 1시간마다 오늘 분이 쌓입니다. **주간 인사이트**도 같은 주기로 갱신됩니다 (대시보드가 주 열람 화면).') as any,
          icon: { type: 'emoji', emoji: '📌' },
        },
      } as any,
    ],
  });

  console.log(`✅ 주간 페이지 생성: "${title}"`);
  return page.id;
}

/** 지정 페이지에 토글 블록으로 콘텐츠 추가 */
export async function appendDigest(
  pageId: string,
  title: string,
  digestMarkdown: string
): Promise<void> {
  console.log(`📝 노션에 추가: "${title}"`);

  const children = markdownToBlocks(digestMarkdown);
  const first = children.slice(0, CHUNK);

  const res = await notion.blocks.children.append({
    block_id: pageId,
    children: [
      {
        object: 'block',
        type: 'toggle',
        toggle: {
          rich_text: toRichText(`**${title}**`) as any,
          children: first as any,
        },
      } as any,
    ],
  });

  const rest = children.slice(CHUNK);
  if (rest.length > 0) {
    const toggleId = (res.results[0] as any).id as string;
    for (let i = 0; i < rest.length; i += CHUNK) {
      await notion.blocks.children.append({
        block_id: toggleId,
        children: rest.slice(i, i + CHUNK) as any,
      });
    }
  }

  console.log(`✅ 노션 업데이트 완료 (블록 ${countBlocks(children)}개)`);
}

function richTextPlain(block: { type: string; [k: string]: unknown }): string {
  const node = (block as { toggle?: { rich_text?: { plain_text?: string }[] } }).toggle;
  return (node?.rich_text ?? []).map((t) => t.plain_text ?? '').join('').replace(/\*\*/g, '');
}

async function listChildBlocks(blockId: string): Promise<{ id: string; type: string; [k: string]: unknown }[]> {
  const blocks: { id: string; type: string; [k: string]: unknown }[] = [];
  let cursor: string | undefined;
  do {
    const res = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
    });
    blocks.push(...(res.results as { id: string; type: string }[]));
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return blocks;
}

async function appendChildren(blockId: string, children: NotionBlock[]): Promise<void> {
  for (let i = 0; i < children.length; i += CHUNK) {
    await notion.blocks.children.append({
      block_id: blockId,
      children: children.slice(i, i + CHUNK) as any,
    });
  }
}

async function replaceToggleChildren(toggleId: string, children: NotionBlock[]): Promise<void> {
  const existing = await listChildBlocks(toggleId);
  for (const block of existing) {
    await notion.blocks.update({ block_id: block.id, archived: true });
  }
  await appendChildren(toggleId, children);
}

/** 주간 인사이트 토글 — 있으면 내용 교체, 없으면 추가 */
export async function upsertWeeklyInsight(
  pageId: string,
  title: string,
  digestMarkdown: string
): Promise<void> {
  const children = markdownToBlocks(digestMarkdown);
  const blocks = await listChildBlocks(pageId);
  const existing = blocks.find((b) => b.type === 'toggle' && /주간 인사이트/.test(richTextPlain(b)));

  if (!existing) {
    await appendDigest(pageId, title, digestMarkdown);
    return;
  }

  console.log(`📝 노션 주간 인사이트 갱신: "${title}"`);
  await notion.blocks.update({
    block_id: existing.id,
    toggle: { rich_text: toRichText(`**${title}**`) as any },
  } as any);
  await replaceToggleChildren(existing.id, children);
  console.log(`✅ 주간 인사이트 갱신 완료 (블록 ${countBlocks(children)}개)`);
}

function toggleHeading(block: NotionBlock): string {
  const node = block.toggle as { rich_text?: { plain_text?: string; text?: { content?: string } }[] } | undefined;
  return (node?.rich_text ?? [])
    .map((t) => t.plain_text ?? t.text?.content ?? '')
    .join('')
    .replace(/\*\*/g, '')
    .trim();
}

/** 날짜 토글에 신규 기사 블록을 이어 붙임. 같은 축 토글이 있으면 그 안에 병합 */
export async function appendToDailyToggle(
  weekPageId: string,
  newsIso: string,
  digestMarkdown: string
): Promise<void> {
  const blocks = await listChildBlocks(weekPageId);
  const titleRe = new RegExp(`📰\\s*${newsIso}`);
  const existing = blocks.find((b) => b.type === 'toggle' && titleRe.test(richTextPlain(b)));

  if (!existing) {
    await appendDigest(weekPageId, `📰 ${newsIso}`, digestMarkdown);
    return;
  }

  console.log(`📝 노션 일일 토글에 추가: 📰 ${newsIso}`);
  const incoming = markdownToBlocks(digestMarkdown);
  const axisChildren = await listChildBlocks(existing.id);

  for (const block of incoming) {
    if (block.type !== 'toggle') {
      await appendChildren(existing.id, [block]);
      continue;
    }
    const axisTitle = toggleHeading(block);
    const match = axisChildren.find((c) => c.type === 'toggle' && toggleHeading(c as NotionBlock) === axisTitle);
    const nested = (block.toggle as { children?: NotionBlock[] })?.children ?? [];
    if (match && nested.length) {
      await appendChildren(match.id, nested);
    } else {
      await appendChildren(existing.id, [block]);
    }
  }

  console.log(`✅ 일일 토글 추가 완료 (블록 ${countBlocks(incoming)}개)`);
}

/** KST 자정 — 오늘 날짜 토글이 없으면 빈 데일리를 연다 */
export async function ensureDailyToggle(weekPageId: string, newsIso: string): Promise<void> {
  const blocks = await listChildBlocks(weekPageId);
  const titleRe = new RegExp(`📰\\s*${newsIso}`);
  const existing = blocks.find((b) => b.type === 'toggle' && titleRe.test(richTextPlain(b)));
  if (existing) {
    console.log(`📂 데일리 토글 재사용: 📰 ${newsIso}`);
    return;
  }
  await appendDigest(weekPageId, `📰 ${newsIso}`, '');
}

/** 연결 사전 점검 — NOTION_PAGE_ID = 주간 페이지들이 생성될 부모(허브) 페이지 */
export async function checkConnection(): Promise<void> {
  try {
    const page: any = await notion.pages.retrieve({ page_id: config.notionPageId });
    const title =
      page.properties?.title?.title?.[0]?.plain_text ??
      Object.values<any>(page.properties ?? {}).find((p: any) => p.type === 'title')?.title?.[0]
        ?.plain_text ??
      '(제목 없음)';
    console.log(`🔗 노션 허브 페이지 연결: "${title}"`);
  } catch (e: any) {
    if (e?.code === 'object_not_found') {
      console.error(
        '❌ 노션 페이지를 찾을 수 없습니다. NOTION_PAGE_ID(허브 페이지)가 맞는지, Integration 연결 여부를 확인하세요.'
      );
      process.exit(1);
    }
    throw e;
  }
}
