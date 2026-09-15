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
import {
  kstToday,
  kstHour,
  kstStamp,
  isoWeekId,
  isMondayKst,
  weekNewsDates,
  lastWeekMondayIso,
} from './kst.js';
import { readWeekDaily, readWeekInsight } from './notionRead.js';
import { refreshTrendSnapshots } from './trends.js';
import { ensureWeekPage } from './weekPage.js';
import { loadKnownItems, stripDuplicates, formatKnownForPrompt, logKnownSummary } from './dedup.js';
import { normalizeDigestMarkdown } from './newsItems.js';
import { ensureAuth, config } from './config.js';

type Mode = 'daily' | 'weekly' | 'morning' | 'monthly' | 'hourly' | 'trends';

function parseMode(): Mode {
  if (process.argv.includes('--hourly')) return 'hourly';
  if (process.argv.includes('--morning')) return 'morning';
  if (process.argv.includes('--weekly')) return 'weekly';
  if (process.argv.includes('--monthly')) return 'monthly';
  if (process.argv.includes('--trends')) return 'trends';
  return 'daily';
}

function parseFlagValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  const v = i >= 0 ? process.argv[i + 1] : null;
  if (!v || v.startsWith('--')) return null;
  return v;
}

/** --date YYYY-MM-DD | --last-week → 주간 인사이트 대상 주 */
function parseWeekAnchorIso(): string {
  if (process.argv.includes('--last-week')) return lastWeekMondayIso();
  const date = parseFlagValue('--date');
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return kstToday().iso;
}

function parseFreshWeekly(): boolean {
  return process.argv.includes('--fresh');
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
  mode: 'full' | 'incremental',
): Promise<number> {
  const weekPageId = await ensureWeekPage(isoWeekId(newsIso), newsIso);
  console.log(
    `📰 수집 대상: ${newsHuman} (${newsIso}) ${mode === 'incremental' ? '증분' : '하루 전체'}`,
  );

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
async function refreshWeekly(
  weekAnchorIso: string,
  added: number,
  force = false,
  fresh = false,
): Promise<void> {
  const weekId = isoWeekId(weekAnchorIso);
  const weekPageId = await ensureWeekPage(weekId, weekAnchorIso);
  const newsDates = weekNewsDates(weekAnchorIso);
  const dailyLogs = await readWeekDaily(weekAnchorIso);
  const previous = fresh ? null : await readWeekInsight(weekAnchorIso);

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
      (previous ? ' · 기존 초안 있음' : ' · 첫 작성'),
  );

  const stamp = kstStamp();
  const draftPrompt = weeklyInsightPrompt(stamp, weekId, newsDates, dailyLogs, previous);
  const draft = await generateFromContext(WEEKLY_DRAFT_SYSTEM, draftPrompt);

  let content: string;
  try {
    content = await generateVerified(
      WEEKLY_VERIFY_SYSTEM,
      weeklyVerifyPrompt(stamp, weekId, draft, dailyLogs),
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

/** 1시간마다: 오늘(KST) 증분 수집 → 트렌드. 주간 인사이트는 월요일 KST 09:00만 */
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
  await refreshTrendSnapshots(weekPageId, today.iso, { added, hour });

  if (hour === 9 && isMondayKst()) {
    const lastWeekAnchor = lastWeekMondayIso();
    const lastWeekId = isoWeekId(lastWeekAnchor);
    console.log(`📊 KST 월요일 09:00 — ${lastWeekId} 주간 인사이트 (지난주 월~일 종합)`);
    await refreshWeekly(lastWeekAnchor, added, true);
  } else if (hour === 9) {
    console.log('⏭️ 주간 인사이트 — 월요일 KST 09:00에만 갱신');
  } else {
    console.log(`⏭️ 주간 인사이트 — 월요일 KST 09:00에만 갱신 (현재 ${hour}시)`);
  }
}

/** 수동: 오늘 하루 전체 재수집 + 트렌드 + 주간 인사이트 강제 갱신 */
async function runMorning() {
  const today = kstToday();
  console.log(`🌅 오늘(${today.iso}) 전체 수집 후 트렌드·주간 인사이트 갱신`);
  const weekPageId = await ensureWeekPage(isoWeekId(today.iso), today.iso);
  await ensureDailyToggle(weekPageId, today.iso);
  const added = await collectDaily(today.iso, today.human, 'full');
  await refreshTrendSnapshots(weekPageId, today.iso, { added, force: true });
  await refreshWeekly(today.iso, added, true);
}

/** 수동: 트렌드 스냅샷만 갱신 (수집 없음) */
async function runTrendsOnly() {
  const today = kstToday();
  const hour = kstHour();
  console.log(`📈 트렌드 스냅샷 갱신 — ${today.iso}`);
  const weekPageId = await ensureWeekPage(isoWeekId(today.iso), today.iso);
  await refreshTrendSnapshots(weekPageId, today.iso, { force: true, hour });
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
    case 'trends':
      await runTrendsOnly();
      break;
    case 'weekly': {
      const anchor = parseWeekAnchorIso();
      const fresh = parseFreshWeekly();
      const weekId = isoWeekId(anchor);
      console.log(
        `📊 주간 인사이트 재작성 — ${weekId} (기준일 ${anchor})${fresh ? ' · 초안 무시' : ''}`,
      );
      await refreshWeekly(anchor, 0, true, fresh);
      break;
    }
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
