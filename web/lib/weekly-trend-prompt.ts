import type { DailyReport } from './types';
import { dailyReportToMarkdown } from './daily-trend-prompt';

const LINK_RULE = `
## 출처 규칙 (필수)
- **근거** 줄에 [매체명](https://실제URL) 형식
- 웹 검색으로 확인한 URL만 사용`;

export function dailiesToMarkdown(dailies: DailyReport[]): string {
  return dailies
    .map((d) => {
      const body = dailyReportToMarkdown(d);
      if (!body) return '';
      return `# ${d.date}\n\n${body}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

export function weeklyTrendingPrompt(
  runStamp: string,
  dateFrom: string,
  dateTo: string,
  weekMarkdown: string,
  windowDays: number,
): string {
  return `지금은 ${runStamp}이다. 아래는 **${dateFrom} ~ ${dateTo} (KST, 최근 ${windowDays}일)** 일일 리서치에 **이미 수집된** 기사·이슈다. 새 기사를 찾거나 수집하지 마.

## 임무
웹 검색으로 **해당 기간(KST)** 각 이슈의 **보도 건수**를 추정하고, **주간 상위 언급 순위**를 매겨라.
입력에 없는 새 이슈를 만들지 마.

## 입력 (주간 수집본 — 읽기 전용)
${weekMarkdown}

## 작성 규칙
- 비슷한 사건은 **하나의 이슈**로 묶어라
- **3~5개**만, 기간 내 파급 큰 순
- **보도** · N편 — 기간 내 관련 보도·기사 건수 (숫자+편만, 설명 금지)
- **언급**·**SNS**·**조회** 는 **쓰지 마**
- **요약** · 2문장 이내 (모달용)
- **근거** · [매체명](실제URL) 1개 이상
- **급등**·**점수**·**%** 는 **쓰지 마**
${LINK_RULE}

## 출력 형식 (마크다운 — 다른 말 없이 본문만)

### ## 주간 상위 스냅샷
**업데이트** · ${runStamp}
**대상** · ${dateFrom} ~ ${dateTo}

### ## 상위 이슈

### (통합 이슈명 — 짧은 헤드라인)
**보도** · 8편
**요약** · (2문장 이내)
**근거** · [매체1](URL), [매체2](URL)

(3~5개 반복. 해당 없으면 ### ## 상위 이슈 아래 \`- 해당 기간 상위 이슈 없음\` 한 줄)`;
}
