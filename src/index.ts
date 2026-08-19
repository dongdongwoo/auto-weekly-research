import { generateWithSearch, generateFromContext } from './claude.js';
import { appendDigest, checkConnection } from './notion.js';
import { dailyPrompt, weeklyInsightPrompt, monthlyPrompt } from './prompt.js';
import { assertSourceLinks } from './links.js';
import { kstToday, kstYesterday, isoWeekId, isFridayKst, workWeekNewsDates } from './kst.js';
import { saveDaily, readWorkWeekDaily } from './storage.js';
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

async function resolveWeekPage(): Promise<string> {
  const { iso: todayIso } = kstToday();
  const weekId = isoWeekId(todayIso);
  return ensureWeekPage(weekId, todayIso);
}

/** 전날 뉴스 검색·분석 → 로컬 저장 + 주간 페이지에 날짜 토글 */
async function runDaily(weekPageId: string) {
  const { human: runHuman } = kstToday();
  const { iso: newsIso, human: newsHuman } = kstYesterday();

  console.log(`📰 수집 대상: ${newsHuman} (${newsIso}) 뉴스`);

  const known = loadKnownItems(newsIso, config.dedupLookbackDays);
  logKnownSummary(known);

  const prompt = dailyPrompt(
    runHuman,
    newsHuman,
    newsIso,
    formatKnownForPrompt(known)
  );
  const raw = await generateWithSearch(prompt);
  const { content, removedCount, remainingCount } = stripDuplicates(raw, known);

  if (removedCount > 0) {
    console.log(`🔄 중복 ${removedCount}건 제거, 신규 ${remainingCount}건`);
  }

  assertSourceLinks(content, '일일 리서치');

  saveDaily(newsIso, content);
  await appendDigest(weekPageId, `📰 ${newsIso}`, content);
}

/** 월~금 일일 리서치 → 주간 인사이트 토글 (같은 주간 페이지) */
async function runWeekly(weekPageId: string) {
  const { iso: todayIso, human: runHuman } = kstToday();
  const weekId = isoWeekId(todayIso);
  const newsDates = workWeekNewsDates(todayIso);
  const dailyLogs = readWorkWeekDaily(todayIso);

  if (dailyLogs.length === 0) {
    throw new Error(
      `이번 주(${weekId}) 일일 리서치가 없습니다. 월~금 아침에 npm run morning 을 먼저 실행하세요.`
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
  // 월간은 허브 페이지에 직접 추가
  await appendDigest(config.notionPageId, `📚 ${iso} 월간 딥다이브`, content);
}

/** 매일 아침: (월요일이면 주간 페이지 생성 →) 일일 리서치 + (금요일) 주간 인사이트 */
async function runMorning() {
  const weekPageId = await resolveWeekPage();
  await runDaily(weekPageId);
  if (isFridayKst()) {
    console.log('\n📊 금요일 — 주간 인사이트 작성 시작');
    await runWeekly(weekPageId);
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
    case 'weekly': {
      const weekPageId = await resolveWeekPage();
      await runWeekly(weekPageId);
      break;
    }
    case 'monthly':
      await runMonthly();
      break;
    default: {
      const weekPageId = await resolveWeekPage();
      await runDaily(weekPageId);
    }
  }
}

main().catch((e) => {
  console.error('실행 실패:', e?.message ?? e);
  process.exit(1);
});
