import { Client } from '@notionhq/client';
import { config } from './config.js';

type NotionBlock = {
  id: string;
  type: string;
  has_children?: boolean;
  [key: string]: unknown;
};

const MIN_GAP_MS = Number(
  process.env.NOTION_MIN_GAP_MS ?? (process.env.GITHUB_ACTIONS ? 900 : 500),
);
const MAX_RETRIES = Number(process.env.NOTION_MAX_RETRIES ?? 8);

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

function httpStatus(e: unknown): number | null {
  if (typeof e === 'object' && e !== null && 'status' in e) {
    const status = (e as { status?: number }).status;
    return typeof status === 'number' ? status : null;
  }
  return null;
}

function isRetryableError(e: unknown): boolean {
  if (isRateLimited(e)) return true;
  const status = httpStatus(e);
  return status === 408 || status === 502 || status === 503 || status === 504;
}

function retryReason(e: unknown): string {
  if (isRateLimited(e)) return 'rate limit';
  const status = httpStatus(e);
  return status != null ? `HTTP ${status}` : 'transient';
}

/** GHA·로컬 공용 — 직렬화·블록 캐시·429/5xx 재시도 */
export class NotionSession {
  private lastReq = 0;
  private blockCache = new Map<string, NotionBlock[]>();

  constructor(readonly client: Client) {}

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
      if (isRetryableError(e) && attempt < MAX_RETRIES) {
        const backoff = Math.min(60_000, 3000 * 2 ** attempt);
        console.warn(
          `Notion ${retryReason(e)} — ${Math.round(backoff / 1000)}s 후 재시도 (${attempt + 1}/${MAX_RETRIES})`,
        );
        await sleep(backoff);
        return this.call(fn, attempt + 1);
      }
      throw e;
    }
  }

  retrievePage(pageId: string) {
    return this.call(() => this.client.pages.retrieve({ page_id: pageId }));
  }

  createPage(body: Parameters<Client['pages']['create']>[0]) {
    return this.call(() => this.client.pages.create(body));
  }

  listChildren(blockId: string, cursor?: string) {
    return this.call(() =>
      this.client.blocks.children.list({
        block_id: blockId,
        start_cursor: cursor,
      }),
    );
  }

  appendChildren(blockId: string, children: unknown[]) {
    return this.call(() =>
      this.client.blocks.children.append({
        block_id: blockId,
        children: children as Parameters<Client['blocks']['children']['append']>[0]['children'],
      }),
    );
  }

  updateBlock(blockId: string, body: Omit<Parameters<Client['blocks']['update']>[0], 'block_id'>) {
    return this.call(() => this.client.blocks.update({ block_id: blockId, ...body }));
  }

  archiveBlock(blockId: string) {
    return this.call(() => this.client.blocks.update({ block_id: blockId, archived: true }));
  }

  /** 직계 자식 블록 (페이지네이션·캐시) */
  async getDirectBlocks(blockId: string): Promise<NotionBlock[]> {
    const cached = this.blockCache.get(blockId);
    if (cached) return cached;

    const blocks: NotionBlock[] = [];
    let cursor: string | undefined;
    do {
      const res = await this.listChildren(blockId, cursor);
      blocks.push(...(res.results as NotionBlock[]));
      cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
    } while (cursor);

    this.blockCache.set(blockId, blocks);
    return blocks;
  }
}

let shared: NotionSession | null = null;

export function getNotionSession(): NotionSession {
  if (!shared) {
    shared = new NotionSession(new Client({ auth: config.notionApiKey }));
  }
  return shared;
}

export type { NotionBlock };
