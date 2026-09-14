import type { NotionBlock, NotionSession } from './notion-session';

type NotionRichText = {
  plain_text?: string;
  text?: { content: string; link?: { url: string } | null };
  annotations?: { bold?: boolean };
};

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

async function blockToMarkdownLines(
  session: NotionSession,
  block: NotionBlock,
  bulletDepth = 0,
): Promise<string[]> {
  const lines: string[] = [];
  const prefix = '  '.repeat(bulletDepth);

  switch (block.type) {
    case 'toggle': {
      const title = toggleTitle(block);
      lines.push(`### ${title}`);
      for (const child of await session.getAllBlocks(block.id)) {
        lines.push(...(await blockToMarkdownLines(session, child, bulletDepth)));
      }
      break;
    }
    case 'heading_2':
      lines.push(
        `## ${richTextToMarkdown((block.heading_2 as { rich_text: NotionRichText[] }).rich_text)}`,
      );
      break;
    case 'heading_3':
      lines.push(
        `### ${richTextToMarkdown((block.heading_3 as { rich_text: NotionRichText[] }).rich_text)}`,
      );
      break;
    case 'bulleted_list_item': {
      const text = richTextToMarkdown(
        (block.bulleted_list_item as { rich_text: NotionRichText[] }).rich_text,
      );
      lines.push(`${prefix}- ${text}`);
      for (const child of await session.getAllBlocks(block.id)) {
        lines.push(...(await blockToMarkdownLines(session, child, bulletDepth + 1)));
      }
      break;
    }
    case 'callout': {
      const node = block.callout as { rich_text: NotionRichText[] };
      const text = richTextToMarkdown(node.rich_text);
      if (text.trim()) lines.push(text);
      break;
    }
    case 'paragraph': {
      const text = richTextToMarkdown(
        (block.paragraph as { rich_text: NotionRichText[] }).rich_text,
      );
      if (text.trim()) lines.push(text);
      break;
    }
    default:
      break;
  }

  return lines;
}

/** 토글 하위 블록 → 마크다운 (트렌드 스냅샷 파싱용) */
export async function toggleBlocksToMarkdown(
  session: NotionSession,
  blockId: string,
): Promise<string> {
  const blocks = await session.getAllBlocks(blockId);
  const lines: string[] = [];
  for (const block of blocks) {
    lines.push(...(await blockToMarkdownLines(session, block)));
  }
  return lines.join('\n').trim();
}
