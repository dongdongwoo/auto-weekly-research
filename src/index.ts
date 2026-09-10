import { generateWithSearch, generateFromContext, generateVerified } from './claude.js';
import {
  appendDigest,
  appendToDailyToggle,
  ensureDailyToggle,
  upsertWeeklyInsight,
  checkConnection,
} from './notion.js';
import {
  dailyPrompt,
  hourlyDailyPrompt,
  weeklyInsightPrompt,
  weeklyVerifyPrompt,
  monthlyPrompt,
  WEEKLY_DRAFT_SYSTEM,
  WEEKLY_VERIFY_SYSTEM,
} from './prompt.js';
import { assertSourceLinks } from './links.js';
import { kstToday, kstHour, kstStamp, isoWeekId, weekNewsDates } from './kst.js';
import { readWeekDaily, readWeekInsight } from './notionRead.js';
import { ensureWeekPage } from './weekPage.js';
import {
  loadKnownItems,
  stripDuplicates,
  formatKnownForPrompt,
  logKnownSummary,
} from './dedup.js';
import { normalizeDigestMarkdown } from './newsItems.js';
import { ensureAuth, config } from './config.js';

type Mode = 'daily' | 'weekly' | 'morning' | 'monthly' | 'hourly';

function parseMode(): Mode {
  if (process.argv.includes('--hourly')) return 'hourly';
  if (process.argv.includes('--morning')) return 'morning';
  if (process.argv.includes('--weekly')) return 'weekly';
  if (process.argv.includes('--monthly')) return 'monthly';
  return 'daily';
}

function hasNewArticles(content: string, remainingCount: number): boolean {
  if (remainingCount <= 0) return false;
  if (/신규 항목 없음/.test(content) && remainingCount === 0) return false;
  return true;
}

/** 지정일의 신규 뉴스 수집 → 해당 주 날짜 토글에 병합 */
async function collectDaily(
  newsIso: string,
  newsHuman: string,
  mode: 'full' | 'incremental'
): Promise<number> {
  const weekPageId = await ensureWeekPage(isoWeekId(newsIso), newsIso);
  console.log(`📰 수집 대상: ${newsHuman} (${newsIso}) ${mode === 'incremental' ? '증분' : '하루 전체'}`);

  const known = await loadKnownItems(newsIso, config.dedupLookbackDays, true);
  logKnownSummary(known, newsIso);

  const prompt =
    mode === 'incremental'
      ? hourlyDailyPrompt(kstStamp(), newsHuman, newsIso, formatKnownForPrompt(known, 80, newsIso))
      : dailyPrompt(kstToday().human, newsHuman, newsIso, formatKnownForPrompt(known, 80, newsIso));

  const raw = await generateWithSearch(prompt);
  const normalized = normalizeDigestMarkdown(raw);
  const { content, removedCount, remainingCount } = stripDuplicates(normalized, known);

  if (removedCount > 0) {
    console.log(`🔄 중복 ${removedCount}건 제거, 신규 ${remainingCount}건`);
  }

  if (!hasNewArticles(content, remainingCount)) {
    console.log('📭 신규 기사 없음');
    return 0;
  }

  assertSourceLinks(content, mode === 'incremental' ? '시간별 수집' : '일일 리서치');
  await appendToDailyToggle(weekPageId, newsIso, content);
  return remainingCount;
}

/** 해당 주 일일 원문 → 초안 → 웹 검색 검증 → 주간 인사이트 토글 갱신 */
async function refreshWeekly(weekAnchorIso: string, added: number, force = false): Promise<void> {
  const weekId = isoWeekId(weekAnchorIso);
  const weekPageId = await ensureWeekPage(weekId, weekAnchorIso);
  const newsDates = weekNewsDates(weekAnchorIso);
  const dailyLogs = await readWeekDaily(weekAnchorIso);
  const previous = await readWeekInsight(weekAnchorIso);

  if (dailyLogs.length === 0) {
    console.log(`⏭️ 주간(${weekId}) 일일 리서치가 없어 인사이트를 건너뜁니다.`);
    return;
  }

  if (!force && added === 0 && previous) {
    console.log(`⏭️ 신규 기사 없음 — ${weekId} 주간 인사이트 유지`);
    return;
  }

  console.log(
    `📂 주간 인사이트 입력: ${dailyLogs.length}일 (${dailyLogs.map((d) => d.iso).join(', ')})` +
      (previous ? ' · 기존 초안 있음' : ' · 첫 작성')
  );

  const stamp = kstStamp();
  const draftPrompt = weeklyInsightPrompt(stamp, weekId, newsDates, dailyLogs, previous);
  const draft = await generateFromContext(WEEKLY_DRAFT_SYSTEM, draftPrompt);

  let content: string;
  try {
    content = await generateVerified(
      WEEKLY_VERIFY_SYSTEM,
      weeklyVerifyPrompt(stamp, weekId, draft, dailyLogs)
    );
  } catch (e) {
    console.warn(`⚠️ 검증 단계 실패 — 초안을 그대로 사용: ${e instanceof Error ? e.message : e}`);
    content = draft;
  }

  if (!content.trim()) {
    throw new Error('주간 인사이트 본문이 비어 있습니다.');
  }

  assertSourceLinks(content, '주간 인사이트');
  await upsertWeeklyInsight(weekPageId, `📊 주간 인사이트 · ${stamp}`, content);
  console.log('\n💡 대시보드·노션에서 갱신된 주간 인사이트를 확인하세요.');
}

async function runMonthly() {
  const { iso, human } = kstToday();
  const prompt = monthlyPrompt(human);
  const content = await generateWithSearch(prompt);
  assertSourceLinks(content, '월간 딥다이브');
  await appendDigest(config.notionPageId, `📚 ${iso} 월간 딥다이브`, content);
}

/** 1시간마다: 오늘(KST) 증분 수집 + 이번 주 인사이트. 날짜가 바뀌면 새 데일리 토글을 연다 */
async function runHourly() {
  const stamp = kstStamp();
  const today = kstToday();
  const hour = kstHour();
  console.log(`⏰ 시간별 업데이트 — ${stamp}`);

  const weekPageId = await ensureWeekPage(isoWeekId(today.iso), today.iso);
  if (hour === 0) {
    console.log(`🗓️ KST 00시 — 오늘 데일리 시작 📰 ${today.iso}`);
  }
  await ensureDailyToggle(weekPageId, today.iso);

  const added = await collectDaily(today.iso, today.human, 'incremental');
  await refreshWeekly(today.iso, added);
}

/** 수동: 오늘 하루 전체 재수집 + 이번 주 인사이트 강제 갱신 */
async function runMorning() {
  const today = kstToday();
  console.log(`🌅 오늘(${today.iso}) 전체 수집 후 주간 인사이트 갱신`);
  await ensureDailyToggle(await ensureWeekPage(isoWeekId(today.iso), today.iso), today.iso);
  const added = await collectDaily(today.iso, today.human, 'full');
  await refreshWeekly(today.iso, added, true);
}

async function main() {
  const mode = parseMode();
  ensureAuth();
  await checkConnection();

  switch (mode) {
    case 'hourly':
      await runHourly();
      break;
    case 'morning':
      await runMorning();
      break;
    case 'weekly':
      await refreshWeekly(kstToday().iso, 0, true);
      break;
    case 'monthly':
      await runMonthly();
      break;
    default: {
      const today = kstToday();
      await collectDaily(today.iso, today.human, 'full');
    }
  }
}

main().catch((e) => {
  console.error('실행 실패:', e?.message ?? e);
  process.exit(1);
});
