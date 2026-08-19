import { Client } from '@notionhq/client';
import { config } from './config.js';
import { markdownToBlocks, toRichText, NotionBlock } from './markdown.js';

const notion = new Client({ auth: config.notionApiKey });

const CHUNK = 90;

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
          rich_text: toRichText('매일 아침 **일일 리서치**가 날짜별 토글로 쌓입니다. 금요일에 **주간 인사이트** 토글이 추가됩니다.') as any,
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

  console.log(`✅ 노션 업데이트 완료 (블록 ${children.length}개)`);
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
