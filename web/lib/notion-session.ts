import { Client } from '@notionhq/client';

type NotionBlock = {
  id: string;
  type: string;
  created_time?: string;
  [key: string]: unknown;
};

const MIN_GAP_MS = Number(process.env.NOTION_MIN_GAP_MS ?? 400);
const MAX_RETRIES = 8;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRateLimited(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: string }).code === 'rate_limited'
  );
}

/** 단일 fetch 사이클 동안 API 호출을 직렬화·캐시·429 재시도 */
export class NotionSession {
  private lastReq = 0;
  private blockCache = new Map<string, NotionBlock[]>();

  constructor(readonly client: Client) {}

  clearCache() {
    this.blockCache.clear();
  }

  private async throttle() {
    const wait = this.lastReq + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastReq = Date.now();
  }

  private async call<T>(fn: () => Promise<T>, attempt = 0): Promise<T> {
    await this.throttle();
    try {
      return await fn();
    } catch (e) {
      if (isRateLimited(e) && attempt < MAX_RETRIES) {
        const backoff = Math.min(30_000, 1500 * 2 ** attempt);
        console.warn(`Notion rate limit — ${Math.round(backoff / 1000)}s 후 재시도 (${attempt + 1}/${MAX_RETRIES})`);
        await sleep(backoff);
        return this.call(fn, attempt + 1);
      }
      throw e;
    }
  }

  retrievePage(pageId: string) {
    return this.call(() => this.client.pages.retrieve({ page_id: pageId }));
  }

  listHubChildren(blockId: string, cursor?: string) {
    return this.call(() =>
      this.client.blocks.children.list({
        block_id: blockId,
        start_cursor: cursor,
      }),
    );
  }

  async getAllBlocks(blockId: string): Promise<NotionBlock[]> {
    const cached = this.blockCache.get(blockId);
    if (cached) return cached;

    const blocks: NotionBlock[] = [];
    let cursor: string | undefined;
    do {
      const res = await this.call(() =>
        this.client.blocks.children.list({
          block_id: blockId,
          start_cursor: cursor,
        }),
      );
      blocks.push(...(res.results as NotionBlock[]));
      cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
    } while (cursor);

    this.blockCache.set(blockId, blocks);
    return blocks;
  }
}

export type { NotionBlock };
