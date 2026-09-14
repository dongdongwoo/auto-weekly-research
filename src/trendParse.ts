import { compositeScore, parseCount, parsePct } from './viralScore.js';

export type TrendSourceLink = { label: string; url: string };
export type TrendItem = {
  id: string;
  headline: string;
  score: number;
  coverageCount: number;
  mentionCount: number;
  rising: boolean;
  summary: string;
  sources: TrendSourceLink[];
};
export type TrendReport = {
  targetDate: string;
  updatedAt: string;
  items: TrendItem[];
};

const FIELD_LABELS =
  '요약|출처|근거|업데이트|대상일|대상|점수|급등|보도|언급|조회';

function parseLabeledLine(text: string): { label: string; body: string } | null {
  const raw = text.replace(/\*\*/g, '').trim();
  const m = raw.match(new RegExp(`^(${FIELD_LABELS})\\s*[·•:—\\-]\\s*([\\s\\S]*)$`));
  if (m) return { label: m[1], body: m[2].trim() };
  return null;
}

function parseSourcesFromText(text: string): TrendSourceLink[] {
  const links: TrendSourceLink[] = [];
  const re = /\[([^\]]+)\]\((https?:[^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    links.push({ label: m[1], url: m[2] });
  }
  return links;
}

function readCounts(coverageRaw: string, mentionRaw: string, scoreRaw?: string) {
  let coverageCount = parseCount(coverageRaw);
  let mentionCount = parseCount(mentionRaw);
  if (coverageCount === 0 && mentionCount === 0 && scoreRaw) {
    const legacy = parsePct(scoreRaw);
    if (legacy > 0) {
      coverageCount = Math.round(legacy / 15);
      mentionCount = Math.round(legacy / 20);
    }
  }
  return { coverageCount, mentionCount };
}

/** LLM 마크다운 응답 → TrendReport */
export function parseTrendMarkdown(markdown: string, idPrefix = 'dt'): TrendReport | null {
  let updatedAt = '';
  let targetDate = '';
  let section = '';
  let currentItem: Record<string, string> | null = null;
  let itemIdx = 0;
  const items: TrendItem[] = [];

  const flushItem = () => {
    if (!currentItem?.title) return;
    const sources: TrendSourceLink[] = currentItem.sources ? JSON.parse(currentItem.sources) : [];
    const risingText = (currentItem.rising ?? '').toLowerCase();
    const rising = risingText.startsWith('예') || risingText.includes('급등');
    const { coverageCount, mentionCount } = readCounts(
      currentItem.coverage ?? '',
      currentItem.mentions ?? '',
      currentItem.score,
    );
    items.push({
      id: `${idPrefix}-${itemIdx++}`,
      headline: currentItem.title,
      score: compositeScore(coverageCount, mentionCount, rising),
      coverageCount,
      mentionCount,
      rising,
      summary: currentItem.summary ?? '',
      sources,
    });
    currentItem = null;
  };

  const detectSection = (title: string) => {
    flushItem();
    const t = title.replace(/\*\*/g, '').replace(/^##\s*/, '').trim();
    if (/데일리 급등|주간|상위 이슈|급등 이슈/.test(t)) section = 'trending';
    else if (/스냅샷/.test(t)) section = 'meta';
  };

  const startItem = (title: string) => {
    flushItem();
    currentItem = { title };
  };

  const ingestLine = (line: string) => {
    const text = line.trim();
    if (!text || text.startsWith('- 오늘 급등')) return;

    const h2 = text.match(/^#{1,2}\s+(.+)/);
    if (h2) {
      detectSection(h2[1]);
      return;
    }

    const h3 = text.match(/^#{3}\s+(.+)/);
    if (h3) {
      const title = h3[1].replace(/\*\*/g, '').trim();
      if (section === 'trending' && title && !/^급등/.test(title)) startItem(title);
      return;
    }

    const labeled = parseLabeledLine(text);
    if (labeled) {
      const sources = parseSourcesFromText(labeled.body);
      if (section === 'meta') {
        if (labeled.label === '업데이트') updatedAt = labeled.body;
        else if (labeled.label === '대상일' || labeled.label === '대상') targetDate = labeled.body.trim();
        return;
      }
      if (!currentItem) return;
      if (labeled.label === '점수') currentItem.score = labeled.body;
      else if (labeled.label === '급등') currentItem.rising = labeled.body;
      else if (labeled.label === '보도') currentItem.coverage = labeled.body;
      else if (labeled.label === '언급') currentItem.mentions = labeled.body;
      else if (labeled.label === '요약') currentItem.summary = labeled.body;
      else if (labeled.label === '근거' || labeled.label === '출처') {
        currentItem.sources = JSON.stringify(sources);
      }
    }
  };

  for (const line of markdown.split('\n')) ingestLine(line);
  flushItem();

  if (items.length === 0 && !updatedAt) return null;
  items.sort((a, b) => b.score - a.score || b.coverageCount - a.coverageCount);
  return { targetDate, updatedAt, items };
}
