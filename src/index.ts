import { generateWithSearch, generateFromContext } from './claude.js';
import { appendDigest, checkConnection } from './notion.js';
import { dailyPrompt, weeklyInsightPrompt, monthlyPrompt } from './prompt.js';
import { assertSourceLinks } from './links.js';
import { kstToday, kstYesterday, isoWeekId, isMondayKst, weekNewsDates } from './kst.js';
import { saveDaily, readWeekDaily } from './storage.js';
import { ensureWeekPage } from './weekPage.js';
import {
  loadKnownItems,
  stripDuplicates,
  formatKnownForPrompt,
  logKnownSummary,
} from './dedup.js';
import { ensureAuth, config } from './config.js';

type Mode = 'daily' | 'weekly' | 'morning' | 'monthly';

function parseMode(): Mode {
  if (process.argv.includes('--morning')) return 'morning';
  if (process.argv.includes('--weekly')) return 'weekly';
  if (process.argv.includes('--monthly')) return 'monthly';
  return 'daily';
}

/** 전날 뉴스 검색·분석 → 로컬 저장 + 해당 주 Notion 페이지에 토글 */
async function runDaily(weekPageId: string) {
  const { human: runHuman } = kstToday();
  const { iso: newsIso, human: newsHuman } = kstYesterday();

  console.log(`📰 수집 대상: ${newsHuman} (${newsIso}) 뉴스`);

  const known = loadKnownItems(newsIso, config.dedupLookbackDays);
  logKnownSummary(known);

  const prompt = dailyPrompt(runHuman, newsHuman, newsIso, formatKnownForPrompt(known));
  const raw = await generateWithSearch(prompt);
  const { content, removedCount, remainingCount } = stripDuplicates(raw, known);

  if (removedCount > 0) {
    console.log(`🔄 중복 ${removedCount}건 제거, 신규 ${remainingCount}건`);
  }

  assertSourceLinks(content, '일일 리서치');

  saveDaily(newsIso, content);
  await appendDigest(weekPageId, `📰 ${newsIso}`, content);
}

/** 월~일 일일 리서치 → 주간 인사이트 토글 */
async function runWeekly(weekAnchorIso: string) {
  const { human: runHuman } = kstToday();
  const weekId = isoWeekId(weekAnchorIso);
  const weekPageId = await ensureWeekPage(weekId, weekAnchorIso);
  const newsDates = weekNewsDates(weekAnchorIso);
  const dailyLogs = readWeekDaily(weekAnchorIso);

  if (dailyLogs.length === 0) {
    throw new Error(
      `주간(${weekId}) 일일 리서치가 없습니다. npm run morning 을 먼저 실행하세요.`
    );
  }

  console.log(`📂 주간 인사이트 입력: ${dailyLogs.length}일 (${dailyLogs.map((d) => d.iso).join(', ')})`);

  const prompt = weeklyInsightPrompt(runHuman, weekId, newsDates, dailyLogs);
  const content = await generateFromContext(
    '너는 금융 리서치 애널리스트다. 제공된 일일 리서치 원문만 근거로 작성하고, 원문에 없는 사실을 추가하지 마라.',
    prompt
  );
  assertSourceLinks(content, '주간 인사이트');

  await appendDigest(weekPageId, `📊 주간 인사이트 — 팀 공유용`, content);
  console.log('\n💡 노션 주간 페이지에서 인사이트를 확인하고 팀에 공유하세요.');
}

async function runMonthly() {
  const { iso, human } = kstToday();
  const prompt = monthlyPrompt(human);
  const content = await generateWithSearch(prompt);
  assertSourceLinks(content, '월간 딥다이브');
  await appendDigest(config.notionPageId, `📚 ${iso} 월간 딥다이브`, content);
}

/** 매일: 전날 일일 리서치 + (월요일) 지난주 마감 → 주간 인사이트 → 이번 주 페이지 생성 */
async function runMorning() {
  const { iso: newsIso } = kstYesterday();

  // 전날(일요일) 뉴스는 해당 ISO 주(지난주) 페이지에 등록
  const lastWeekPageId = await ensureWeekPage(isoWeekId(newsIso), newsIso);
  await runDaily(lastWeekPageId);

  if (isMondayKst()) {
    console.log('\n📊 월요일 — 지난주 주간 인사이트 작성');
    await runWeekly(newsIso);

    const { iso: todayIso } = kstToday();
    const thisWeekId = isoWeekId(todayIso);
    console.log(`\n🗓️ 이번 주(${thisWeekId}) 페이지 생성 — 화요일부터 일일 리서치 등록`);
    await ensureWeekPage(thisWeekId, todayIso);
  }
}

async function main() {
  const mode = parseMode();
  ensureAuth();
  await checkConnection();

  switch (mode) {
    case 'morning':
      await runMorning();
      break;
    case 'weekly':
      await runWeekly(kstYesterday().iso);
      break;
    case 'monthly':
      await runMonthly();
      break;
    default: {
      const { iso: newsIso } = kstYesterday();
      const weekPageId = await ensureWeekPage(isoWeekId(newsIso), newsIso);
      await runDaily(weekPageId);
    }
  }
}

main().catch((e) => {
  console.error('실행 실패:', e?.message ?? e);
  process.exit(1);
});
