import type { DailyReport } from './types';

const LINK_RULE = `
## 출처 규칙 (필수)
- **근거** 줄에 [매체명](https://실제URL) 형식
- 웹 검색으로 확인한 URL만 사용`;

export function dailyReportToMarkdown(daily: DailyReport): string {
  const lines: string[] = [];
  for (const axis of daily.axes) {
    lines.push(`## ${axis.name}`, '');
    for (const art of axis.articles) {
      lines.push(`### ${art.headline}`);
      if (art.summary) lines.push(`**요약** · ${art.summary}`);
      if (art.analysis) lines.push(`**분석** · ${art.analysis}`);
      if (art.sources.length) {
        const src = art.sources.map((s) => `[${s.label}](${s.url || '#'})`).join(', ');
        lines.push(`**출처** · ${src}`);
      }
      lines.push('');
    }
  }
  return lines.join('\n').trim();
}

/** GHA 시간별 파이프라인 — 이미 수집된 오늘 기사만 LLM에 전달 */
export function dailyTrendingPrompt(
  runStamp: string,
  newsDateIso: string,
  newsDateHuman: string,
  dailyMarkdown: string,
): string {
  return `지금은 ${runStamp}이다. 아래는 **${newsDateHuman} (${newsDateIso}, KST)** 일일 리서치에 **이미 수집된** 기사·이슈다. 새 기사를 찾거나 수집하지 마.

## 임무
웹 검색으로 **오늘(KST) 기준** 각 이슈의 **보도 건수**·**SNS 언급 횟수**를 추정하고, **데일리 급등 순위**를 매겨라.
입력에 없는 새 이슈를 만들지 마.

## 입력 (오늘 수집본 — 읽기 전용)
${dailyMarkdown}

## 작성 규칙
- 비슷한 사건은 **하나의 이슈**로 묶어라
- **3~5개**만, 파급 큰 순 (목록 순서로 순위 표현 — **제목 앞에 1· 2· 같은 순번 붙이지 마**)
- **보도** · N편 — 오늘 웹에서 확인된 관련 보도·기사 건수 (숫자+편만, 설명 금지)
- **언급** · N회 — X·Reddit·링크드인 등 SNS·커뮤니티 언급 추정 횟수 (숫자+회만, 설명 금지)
- **급등** · 예/아니오
- **요약** · 2문장 이내 (모달용)
- **근거** · [매체명](실제URL) 1개 이상
- **점수**·**조회**·**종합**·**%** 는 **쓰지 마**
${LINK_RULE}

## 출력 형식 (마크다운 — 다른 말 없이 본문만)

### ## 데일리 급등 스냅샷
**업데이트** · ${runStamp}
**대상일** · ${newsDateIso}

### ## 급등 이슈

### (통합 이슈명 — 짧은 헤드라인)
**보도** · 5편
**언급** · 12회
**급등** · 예
**요약** · (2문장 이내)
**근거** · [매체1](URL), [매체2](URL)

(3~5개 반복. 해당 없으면 ### ## 급등 이슈 아래 \`- 오늘 급등 이슈 없음\` 한 줄)`;
}
