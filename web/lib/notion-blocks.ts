import { Client } from '@notionhq/client';
import { NotionSession, type NotionBlock } from './notion-session';
import type {
  Article,
  DailyReport,
  DashboardData,
  ProductInsight,
  SourceLink,
  WeekPage,
  WeeklyCaveat,
  WeeklyIssue,
  WeeklyOutlook,
  WeeklyReport,
  WeeklySignal,
  WeeklyTheme,
} from './types';

const WEEK_PAGE_RE = /📊\s+(20\d\d-W\d{2})/;
const DATE_TOGGLE_RE = /📰\s*(\d{4}-\d{2}-\d{2})/;
const WEEKLY_TOGGLE_RE = /주간 인사이트/;

type NotionRichText = {
  plain_text?: string;
  text?: { content: string; link?: { url: string } | null };
  annotations?: { bold?: boolean };
};

function getSession(): NotionSession {
  const key = process.env.NOTION_API_KEY;
  const pageId = process.env.NOTION_PAGE_ID;
  if (!key || !pageId) {
    throw new Error('NOTION_API_KEY and NOTION_PAGE_ID must be set');
  }
  return new NotionSession(new Client({ auth: key }));
}

function hubPageId(): string {
  const id = process.env.NOTION_PAGE_ID;
  if (!id) throw new Error('NOTION_PAGE_ID must be set');
  return id;
}

function maxWeeks(): number {
  return Math.max(1, Number(process.env.NOTION_MAX_WEEKS ?? 4));
}

function richTextToPlain(rich: NotionRichText[]): string {
  return rich.map((rt) => rt.plain_text ?? rt.text?.content ?? '').join('');
}

function richTextToLinks(rich: NotionRichText[]): SourceLink[] {
  const links: SourceLink[] = [];
  for (const rt of rich) {
    const url = rt.text?.link?.url;
    const label = rt.plain_text ?? rt.text?.content ?? '';
    if (url) links.push({ label: label || url, url });
  }
  return links;
}

const FIELD_LABELS =
  '요약|분석|출처|사실|왜 주목|해석|주시|근거|기술|규제|비즈니스|교차검증|신뢰도 총평|신뢰도|업데이트|내용|기본|상방|하방|기회|리스크|액션|시사|점수|급등|보도|언급|조회|대상일';

function parseLabeledLine(text: string): { label: string; body: string } | null {
  const raw = text.replace(/\*\*/g, '').trim();
  const m = raw.match(new RegExp(`^(${FIELD_LABELS})\\s*[·•:—\\-]\\s*([\\s\\S]*)$`));
  if (m) return { label: m[1], body: m[2].trim() };
  const m2 = raw.match(new RegExp(`^(${FIELD_LABELS})\\s+([\\s\\S]+)$`));
  if (m2) return { label: m2[1], body: m2[2].trim() };
  return null;
}

function bareLabel(text: string): string | null {
  const t = text.replace(/\*\*/g, '').trim();
  if (new RegExp(`^(${FIELD_LABELS})$`).test(t)) return t;
  return null;
}

function applyArticleField(
  article: Partial<Article>,
  labeled: { label: string; body: string },
  rich?: NotionRichText[],
) {
  if (labeled.label === '요약') article.summary = labeled.body;
  else if (labeled.label === '분석') article.analysis = labeled.body;
  else if (labeled.label === '출처') article.sources = parseSourcesFromText(labeled.body, rich);
}

function parseSourcesFromText(text: string, rich?: NotionRichText[]): SourceLink[] {
  const fromRich = rich ? richTextToLinks(rich) : [];
  if (fromRich.length) return fromRich;
  const links: SourceLink[] = [];
  const re = /\[([^\]]+)\]\((https?:[^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    links.push({ label: m[1], url: m[2] });
  }
  if (!links.length && text.trim()) links.push({ label: text.trim(), url: '' });
  return links;
}

function toggleTitle(block: NotionBlock): string {
  const node = block.toggle as { rich_text?: NotionRichText[] };
  return richTextToPlain(node?.rich_text ?? []).replace(/\*\*/g, '');
}

async function parseDailyToggle(
  session: NotionSession,
  blockId: string,
  date: string,
  weekId: string,
  weekTitle: string,
): Promise<DailyReport> {
  const blocks = await session.getAllBlocks(blockId);
  const axes: { name: string; articles: Article[] }[] = [];
  let currentAxis = '';
  let currentArticle: Partial<Article> | null = null;
  let articleIdx = 0;

  const flushArticle = () => {
    if (!currentArticle?.headline) {
      currentArticle = null;
      return;
    }
    if (!currentAxis) currentAxis = '기타';
    const article: Article = {
      id: `${date}-${articleIdx++}`,
      headline: currentArticle.headline,
      summary: currentArticle.summary ?? '',
      analysis: currentArticle.analysis ?? '',
      sources: currentArticle.sources ?? [],
      axis: currentAxis,
      collectedAt: currentArticle.collectedAt,
    };
    let axisEntry = axes.find((a) => a.name === currentAxis);
    if (!axisEntry) {
      axisEntry = { name: currentAxis, articles: [] };
      axes.push(axisEntry);
    }
    axisEntry.articles.push(article);
    currentArticle = null;
  };

  async function walk(block: NotionBlock, inAxis = false) {
    if (block.type === 'toggle') {
      const title = toggleTitle(block);
      if (/^📰|^📊/.test(title)) return;
      if (!inAxis) {
        flushArticle();
        currentAxis = title;
        const children = await session.getAllBlocks(block.id);
        for (const child of children) await walk(child, true);
        return;
      }
      flushArticle();
      currentArticle = { headline: title, sources: [], collectedAt: block.created_time };
      const children = await session.getAllBlocks(block.id);
      for (const child of children) await walk(child, true);
      return;
    }

    if (block.type === 'heading_2') {
      flushArticle();
      currentAxis = richTextToPlain(
        (block.heading_2 as { rich_text: NotionRichText[] }).rich_text,
      ).replace(/\*\*/g, '');
      return;
    }

    if (block.type === 'heading_3') {
      flushArticle();
      currentArticle = {
        headline: richTextToPlain(
          (block.heading_3 as { rich_text: NotionRichText[] }).rich_text,
        ).replace(/\*\*/g, ''),
        sources: [],
        collectedAt: block.created_time,
      };
      return;
    }

    if (block.type === 'paragraph') {
      const rich = (block.paragraph as { rich_text: NotionRichText[] }).rich_text;
      const text = richTextToPlain(rich);
      if (!text.trim()) return;
      const labeled = parseLabeledLine(text);
      if (labeled && currentArticle) {
        applyArticleField(currentArticle, labeled, rich);
        return;
      }
      if (currentArticle && !currentArticle.summary) {
        currentArticle.summary = text;
      }
      return;
    }

    if (block.type === 'callout') {
      const node = block.callout as { rich_text: NotionRichText[]; icon?: { emoji?: string } };
      const rich = node.rich_text;
      const text = richTextToPlain(rich);
      if (!text.trim() || !currentArticle) return;
      const labeled = parseLabeledLine(text);
      if (labeled) {
        applyArticleField(currentArticle, labeled, rich);
        return;
      }
      currentArticle.analysis = currentArticle.analysis
        ? `${currentArticle.analysis} ${text}`
        : text;
    }
  }

  for (const block of blocks) await walk(block);
  flushArticle();

  const articleCount = axes.reduce((n, a) => n + a.articles.length, 0);
  const searchText = [
    date,
    weekId,
    ...axes.flatMap((a) => [
      a.name,
      ...a.articles.flatMap((art) => [
        art.headline,
        art.summary,
        art.analysis,
        ...art.sources.map((s) => s.label),
      ]),
    ]),
  ]
    .join(' ')
    .toLowerCase();

  return { date, weekId, weekTitle, axes, articleCount, searchText };
}

function applyItemField(item: Record<string, string>, label: string, body: string, sources: SourceLink[]) {
  if (label === '사실') item.fact = [item.fact, body].filter(Boolean).join('\n');
  else if (label === '왜 주목') item.why = body;
  else if (label === '교차검증') item.crossCheck = body;
  else if (label === '분석') item.analysis = body;
  else if (label === '해석') item.interpretation = body;
  else if (label === '주시') item.watch = body;
  else if (label === '내용' || label === '시사') item.body = body;
  else if (label === '기본') item.base = body;
  else if (label === '상방') item.upside = body;
  else if (label === '하방') item.downside = body;
  else if (label === '신뢰도' || label === '신뢰도 총평') item.confidence = body;
  else if (label === '출처' || label === '근거') item.sources = JSON.stringify(sources);
}

function applyProductField(product: ProductInsight, label: string, body: string, sources: SourceLink[]) {
  if (label === '기술') product.tech = body;
  else if (label === '규제') product.regulation = body;
  else if (label === '비즈니스') product.business = body;
  else if (label === '기회') product.opportunity = body.replace(/^✅\s*/, '');
  else if (label === '리스크') product.risk = body.replace(/^⚠️\s*/, '');
  else if (label === '액션') product.action = body;
  else if (label === '근거' || label === '출처') product.sources = sources;
}

async function parseWeeklyToggle(
  session: NotionSession,
  blockId: string,
  weekId: string,
  weekTitle: string,
): Promise<WeeklyReport> {
  const blocks = await session.getAllBlocks(blockId);
  let headlineSummary = '';
  let updatedAt = '';
  let confidenceOverview = '';
  let section = '';
  let currentItem: Record<string, string> | null = null;
  let pendingLabel: string | null = null;
  let itemIdx = 0;

  const signals: WeeklySignal[] = [];
  const issues: WeeklyIssue[] = [];
  const themes: WeeklyTheme[] = [];
  const outlook: WeeklyOutlook[] = [];
  const products: ProductInsight[] = [];
  const caveats: WeeklyCaveat[] = [];
  let currentProduct: ProductInsight | null = null;

  const flushItem = () => {
    if (!currentItem?.title) return;
    const sources: SourceLink[] = currentItem.sources ? JSON.parse(currentItem.sources) : [];
    if (section === 'signals') {
      signals.push({
        id: `signal-${itemIdx++}`,
        title: currentItem.title,
        body: currentItem.body ?? currentItem.fact ?? '',
        sources,
      });
    } else if (section === 'issues') {
      issues.push({
        id: `issue-${itemIdx++}`,
        title: currentItem.title,
        fact: currentItem.fact ?? '',
        crossCheck: currentItem.crossCheck ?? '',
        analysis: currentItem.analysis ?? '',
        why: currentItem.why ?? '',
        confidence: currentItem.confidence ?? '',
        sources,
      });
    } else if (section === 'themes') {
      themes.push({
        id: `theme-${itemIdx++}`,
        title: currentItem.title,
        interpretation: currentItem.interpretation ?? currentItem.body ?? '',
        sources,
      });
    } else if (section === 'outlook') {
      outlook.push({
        id: `outlook-${itemIdx++}`,
        title: currentItem.title,
        base: currentItem.base ?? '',
        upside: currentItem.upside ?? '',
        downside: currentItem.downside ?? '',
        watch: currentItem.watch ?? '',
        sources,
      });
    } else if (section === 'caveats') {
      caveats.push({
        id: `caveat-${itemIdx++}`,
        title: currentItem.title,
        body: currentItem.body ?? currentItem.fact ?? '',
        sources,
      });
    }
    currentItem = null;
    pendingLabel = null;
  };

  const flushProduct = () => {
    if (!currentProduct?.name) return;
    products.push(currentProduct);
    currentProduct = null;
    pendingLabel = null;
  };

  const detectSection = (title: string) => {
    flushItem();
    flushProduct();
    const t = title.replace(/\*\*/g, '').replace(/^##\s*/, '').trim();
    if (/브리프|한 줄 요약/.test(t)) section = 'summary';
    else if (/핵심 시그널|시그널/.test(t) && !/주시/.test(t)) section = 'signals';
    else if (/주요 이슈/.test(t)) section = 'issues';
    else if (/이번 주 흐름|횡단 테마|해석\s*·\s*관점|^해석 · 관점/.test(t)) section = 'themes';
    else if (/시나리오|다음 주 전망|전망 · 주시/.test(t)) section = 'outlook';
    else if (/미확인/.test(t)) section = 'caveats';
    else if (/프로덕트|담당/.test(t)) section = 'products';
    else if (['Vault', 'RWA 담보대출', 'RWA 상품발행', 'STO'].includes(t.trim())) {
      section = 'products';
    }
  };

  const startItem = (title: string) => {
    if (section === 'products' || ['Vault', 'RWA 담보대출', 'RWA 상품발행', 'STO'].includes(title)) {
      flushItem();
      flushProduct();
      currentProduct = { name: title, sources: [] };
      section = 'products';
      return;
    }
    flushProduct();
    flushItem();
    currentItem = { title };
  };

  const ingestText = (text: string, rich?: NotionRichText[]) => {
    const labeled = parseLabeledLine(text);
    if (labeled) {
      pendingLabel = null;
      const sources = parseSourcesFromText(labeled.body, rich);
      if (section === 'summary') {
        if (labeled.label.includes('요약')) headlineSummary += labeled.body + ' ';
        else if (labeled.label === '업데이트') updatedAt = labeled.body;
        else if (labeled.label === '신뢰도' || labeled.label === '신뢰도 총평') {
          confidenceOverview = labeled.body;
        }
        return;
      }
      if (currentItem) applyItemField(currentItem, labeled.label, labeled.body, sources);
      else if (currentProduct) applyProductField(currentProduct, labeled.label, labeled.body, sources);
      return;
    }

    const bare = bareLabel(text);
    if (bare) {
      pendingLabel = bare;
      return;
    }

    if (pendingLabel) {
      const sources = parseSourcesFromText(text, rich);
      if (section === 'summary') {
        if (pendingLabel === '업데이트') updatedAt = text;
        else if (pendingLabel === '신뢰도' || pendingLabel === '신뢰도 총평') confidenceOverview = text;
        else headlineSummary += text + ' ';
      } else if (currentItem) applyItemField(currentItem, pendingLabel, text, sources);
      else if (currentProduct) applyProductField(currentProduct, pendingLabel, text, sources);
      pendingLabel = null;
      return;
    }

    if (section === 'summary') {
      headlineSummary += text + ' ';
    } else if (currentItem && !currentItem.fact && !currentItem.body && !currentItem.interpretation) {
      currentItem.fact = text;
    }
  };

  async function walk(block: NotionBlock) {
    if (block.type === 'heading_2') {
      detectSection(richTextToPlain((block.heading_2 as { rich_text: NotionRichText[] }).rich_text));
      return;
    }

    if (block.type === 'heading_3') {
      const title = richTextToPlain(
        (block.heading_3 as { rich_text: NotionRichText[] }).rich_text,
      ).replace(/\*\*/g, '');
      if (
        /브리프|한 줄 요약|핵심 시그널|주요 이슈|이번 주 흐름|횡단 테마|해석\s*·\s*관점|시나리오|다음 주 전망|담당 프로덕트|미확인/.test(
          title,
        )
      ) {
        detectSection(title);
        return;
      }
      startItem(title);
      return;
    }

    if (block.type === 'toggle') {
      const title = toggleTitle(block);
      const isSection =
        /^##/.test(title) ||
        /브리프|한 줄 요약|핵심 시그널|주요 이슈|이번 주 흐름|횡단 테마|해석\s*·\s*관점|시나리오|다음 주 전망|담당 프로덕트|미확인/.test(
          title,
        );
      if (isSection) {
        detectSection(title.replace(/^##\s*/, ''));
        const children = await session.getAllBlocks(block.id);
        for (const child of children) await walk(child);
        return;
      }
      startItem(title);
      const children = await session.getAllBlocks(block.id);
      for (const child of children) await walk(child);
      return;
    }

    if (block.type === 'paragraph') {
      const rich = (block.paragraph as { rich_text: NotionRichText[] }).rich_text;
      const text = richTextToPlain(rich);
      if (text.trim()) ingestText(text, rich);
      return;
    }

    if (block.type === 'callout') {
      const node = block.callout as { rich_text: NotionRichText[]; icon?: { emoji?: string } };
      const text = richTextToPlain(node.rich_text);
      if (!text.trim()) return;
      const labeled = parseLabeledLine(text);
      if (labeled) {
        ingestText(text, node.rich_text);
        return;
      }
      const emoji = node.icon?.emoji;
      const mapped =
        emoji === '🔍'
          ? '교차검증'
          : emoji === '💡'
            ? '분석'
            : emoji === '🧭'
              ? '해석'
              : emoji === '👀'
                ? '주시'
                : emoji === '🎯'
                  ? '액션'
                  : pendingLabel;
      if (mapped) ingestText(`**${mapped}** · ${text}`, node.rich_text);
      else ingestText(text, node.rich_text);
    }
  }

  for (const block of blocks) await walk(block);
  flushItem();
  flushProduct();

  const searchText = [
    weekId,
    headlineSummary,
    updatedAt,
    ...signals.flatMap((s) => [s.title, s.body]),
    ...issues.flatMap((i) => [i.title, i.fact, i.why, i.analysis, i.crossCheck]),
    ...themes.flatMap((t) => [t.title, t.interpretation]),
    ...outlook.flatMap((o) => [o.title, o.watch, o.base]),
    ...products.flatMap((p) => [p.name, p.tech, p.regulation, p.business, p.opportunity, p.risk]),
    ...caveats.flatMap((c) => [c.title, c.body]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return {
    weekId,
    weekTitle,
    headlineSummary: headlineSummary.trim(),
    updatedAt,
    confidenceOverview,
    signals,
    issues,
    themes,
    outlook,
    products,
    caveats,
    searchText,
  };
}

export async function fetchDashboardData(): Promise<DashboardData> {
  const session = getSession();
  const hubId = hubPageId();

  let hubTitle = '주간 인사이트';
  try {
    const hub: any = await session.retrievePage(hubId);
    hubTitle =
      hub.properties?.title?.title?.[0]?.plain_text ??
      Object.values<any>(hub.properties ?? {}).find((p: any) => p.type === 'title')?.title?.[0]
        ?.plain_text ??
      hubTitle;
  } catch {
    /* ignore */
  }

  const weeks: WeekPage[] = [];
  let cursor: string | undefined;
  do {
    const res = await session.listHubChildren(hubId, cursor);
    for (const block of res.results as NotionBlock[]) {
      if (block.type !== 'child_page') continue;
      const title = (block.child_page as { title: string }).title;
      const weekMatch = title.match(WEEK_PAGE_RE);
      if (weekMatch) {
        weeks.push({ id: block.id, title, weekId: weekMatch[1] });
      }
    }
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);

  weeks.sort((a, b) => b.weekId.localeCompare(a.weekId));
  const weeksToLoad = weeks.slice(0, maxWeeks());

  const dailies: DailyReport[] = [];
  const weeklies: WeeklyReport[] = [];

  for (const week of weeksToLoad) {
    const blocks = await session.getAllBlocks(week.id);
    for (const block of blocks) {
      if (block.type !== 'toggle') continue;
      const title = toggleTitle(block);

      const dateMatch = title.match(DATE_TOGGLE_RE);
      if (dateMatch) {
        const daily = await parseDailyToggle(
          session,
          block.id,
          dateMatch[1],
          week.weekId,
          week.title,
        );
        if (daily.articleCount > 0) dailies.push(daily);
        continue;
      }

      if (WEEKLY_TOGGLE_RE.test(title)) {
        const weekly = await parseWeeklyToggle(session, block.id, week.weekId, week.title);
        if (
          weekly.headlineSummary ||
          weekly.issues.length ||
          weekly.themes.length ||
          weekly.signals.length
        ) {
          weeklies.push(weekly);
        }
      }
    }
  }

  dailies.sort((a, b) => b.date.localeCompare(a.date));
  weeklies.sort((a, b) => b.weekId.localeCompare(a.weekId));

  const totalArticles = dailies.reduce((n, d) => n + d.articleCount, 0);

  return {
    hubTitle,
    generatedAt: new Date().toISOString(),
    weeks,
    dailies,
    weeklies,
    dailyTrend: null,
    stats: {
      totalArticles,
      totalDailies: dailies.length,
      totalWeeklies: weeklies.length,
      latestDaily: dailies[0]?.date ?? null,
      latestWeekly: weeklies[0]?.weekId ?? null,
    },
  };
}
