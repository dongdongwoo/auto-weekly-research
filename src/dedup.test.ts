import {
  formatKnownForPrompt,
  isSimilarHeadline,
  knownFromBlock,
  normalizeUrl,
  stripDuplicates,
  stripEmptyAxes,
  type KnownItem,
} from './dedup.js';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  ok  ${msg}`);
}

const article = (headline: string, url: string) =>
  `### ${headline}\n**요약** · 내용\n**분석** · 이유\n**출처** · [매체](${url})\n`;

const known: KnownItem[] = [
  {
    date: '2026-09-10',
    url: normalizeUrl('https://www.theblock.co/post/ice-tzero?utm_source=tw'),
    headline: 'ICE, tZERO와 토큰화 증권 인프라 공동 구축',
  },
];

console.log('normalizeUrl');
assert(
  normalizeUrl('http://www.theblock.co/post/ice-tzero?utm_source=tw') ===
    normalizeUrl('https://theblock.co/post/ice-tzero'),
  'http/www/utm 이 같은 URL로 묶인다'
);

console.log('isSimilarHeadline');
assert(
  isSimilarHeadline('ICE, tZERO와 토큰화 증권 인프라 공동 구축', 'ICE, tZERO와 토큰화 증권 인프라 공동 구축'),
  '같은 헤드라인은 중복'
);
assert(
  isSimilarHeadline(
    'ICE, tZERO와 토큰화 증권 인프라 공동 구축',
    '속보 ICE, tZERO와 토큰화 증권 인프라 공동 구축 계약'
  ),
  '한쪽이 다른 쪽을 포함하면 중복'
);
assert(
  !isSimilarHeadline('한국 STO 로드맵', 'SEC Vault 규제'),
  '다른 주제는 중복이 아니다'
);

console.log('stripDuplicates — 이미 수집한 URL');
{
  const md = `## RWA 토큰화 시장·인프라\n${article('ICE tZERO 후속', 'https://theblock.co/post/ice-tzero')}`;
  const r = stripDuplicates(md, known);
  assert(r.removedCount === 1 && r.remainingCount === 0, '당일 URL 재수집은 제거되고 신규 0건');
}

console.log('stripDuplicates — 같은 헤드라인, 다른 매체 URL');
{
  const md = `## RWA\n${article('ICE, tZERO와 토큰화 증권 인프라 공동 구축', 'https://www.coindesk.com/ice-tzero')}`;
  const r = stripDuplicates(md, known);
  assert(r.removedCount === 1 && r.remainingCount === 0, '헤드라인이 같으면 URL이 달라도 제거');
}

console.log('stripDuplicates — 같은 응답 안 중복');
{
  const md =
    `## RWA\n` +
    article('신규 펀드 출시', 'https://example.com/a') +
    article('신규 펀드 출시', 'https://example.com/a?utm_campaign=x');
  const r = stripDuplicates(md, []);
  assert(r.removedCount === 1 && r.remainingCount === 1, '한 응답에 같은 기사 두 번이면 하나면 남긴다');
}

console.log('stripDuplicates — 진짜 신규는 통과');
{
  const md = `## RWA\n${article('한국 금융위 STO 3단계 로드맵', 'https://theblock.co/post/korea-sto')}`;
  const r = stripDuplicates(md, known);
  assert(r.removedCount === 0 && r.remainingCount === 1, '다른 소식은 남긴다');
  assert(r.content.includes('한국 금융위'), '신규 본문이 유지된다');
}

console.log('stripEmptyAxes');
{
  const md = `## RWA 토큰화 시장·인프라\n- 해당 없음\n## 상장주식\n${article('헤드라인', 'https://x.com/a')}`;
  const cleaned = stripEmptyAxes(md);
  assert(!cleaned.includes('해당 없음'), '빈 축은 버린다');
  assert(cleaned.includes('### 헤드라인'), '기사 있는 축은 남긴다');
}

console.log('formatKnownForPrompt — 오늘 분은 잘리지 않는다');
{
  const items: KnownItem[] = [];
  for (let i = 0; i < 100; i++) {
    items.push({
      date: '2026-08-01',
      url: `https://old.example/${i}`,
      headline: `지난 기사 ${i}`,
    });
  }
  for (let i = 0; i < 12; i++) {
    items.push({
      date: '2026-09-10',
      url: `https://today.example/${i}`,
      headline: `오늘 기사 ${i}`,
    });
  }
  const text = formatKnownForPrompt(items, 5, '2026-09-10');
  assert(text.includes('오늘 2026-09-10 이미 수집 12건'), '오늘 건수를 명시한다');
  assert((text.match(/오늘 기사/g) ?? []).length === 12, '오늘 12건이 프롬프트에 전부 들어간다');
  assert((text.match(/지난 기사/g) ?? []).length === 5, '이전 분은 maxRest만 넣는다');
}

console.log('knownFromBlock — 링크 없어도 헤드라인은 기록');
{
  const items = knownFromBlock('2026-09-10', '### 공식 발표만 있는 항목\n**요약** · 본문');
  assert(items.length === 1 && items[0].headline.includes('공식 발표'), 'URL 없는 항목도 헤드라인으로 기억한다');
}

console.log('\n✅ dedup 시간별 중복 체크 통과');
