import type { WeeklyReport } from './types';

/** 주간 브리프 — 제목 / 본문 분리 (구 형식 호환) */
export function splitWeeklyBrief(report: WeeklyReport | null | undefined): {
  title: string;
  body: string;
} {
  if (!report) return { title: '', body: '' };

  const title = (report.briefTitle ?? '').trim();
  const body = report.headlineSummary.trim();

  if (title) {
    return { title, body };
  }

  if (!body) {
    return { title: report.issues[0]?.title ?? '', body: '' };
  }

  // 구 형식: 본문 전체가 headlineSummary 한 덩어리
  const sentence = body.match(/^(.{15,140}?[.!?…])\s+/);
  if (sentence && body.length > 160) {
    return { title: sentence[1].trim(), body: body.slice(sentence[0].length).trim() };
  }

  if (body.length > 100) {
    const cut = body.slice(0, 72).replace(/\s+\S*$/, '');
    return { title: `${cut}…`, body };
  }

  return { title: body, body: '' };
}
